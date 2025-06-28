const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ADD THESE 2 LINES - Cross-device functionality
const { CrossDeviceManager } = require('./cross-device-manager.js');
const crossDevice = new CrossDeviceManager();

const app = express();
const PORT = process.env.PORT || 80; // CHANGED: Use port 80 for clean URLs (no port number needed)

app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('00 notetracker.db');

// Create all tables
db.serialize(() => {
    // Notes table
    db.run(`CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT,
        category TEXT,
        subCategory TEXT,
        tags TEXT,
        exampleTickets TEXT,
        slackChannel TEXT,
        macro TEXT DEFAULT 'No',
        faqReference TEXT,
        dateCreated DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Bug tracker table
    db.run(`CREATE TABLE IF NOT EXISTS bug_tracker (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dateCreated TEXT NOT NULL,
        timeStamp TEXT,
        queue TEXT,
        summary TEXT NOT NULL,
        status TEXT DEFAULT 'Not started',
        agent TEXT,
        product TEXT,
        priority TEXT DEFAULT 'P4',
        department TEXT,
        tickets TEXT,
        slackUrl TEXT,
        notionUrl TEXT,
        comments TEXT,
        lastUpdated TEXT,
        lastUpdatedTimeStamp TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Tickets table
    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dateCreated TEXT NOT NULL,
        timeStamp TEXT,
        ticketNo TEXT NOT NULL UNIQUE,
        issue TEXT NOT NULL,
        status TEXT DEFAULT 'Open',
        agent TEXT,
        product TEXT,
        queue TEXT,
        timesReplied INTEGER DEFAULT 0,
        category TEXT,
        department TEXT,
        slackUrl TEXT,
        notionUrl TEXT,
        comments TEXT,
        lastUpdated TEXT,
        lastUpdatedTimeStamp TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// ===== NOTES API =====
app.get('/api/notes', (req, res) => {
    db.all('SELECT * FROM notes ORDER BY lastUpdated DESC', (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        // ADDED: Sync notes count to cross-device
        crossDevice.writeData('notes-count', rows.length);
        crossDevice.writeData('last-notes-access', new Date().toISOString());
        
        res.json({ success: true, data: rows });
    });
});

app.post('/api/notes', (req, res) => {
    const { title, content, category, subCategory, tags, exampleTickets, slackChannel, macro, faqReference } = req.body;
    
    if (!title) {
        res.status(400).json({ success: false, error: 'Title is required' });
        return;
    }
    
    const now = new Date().toISOString();
    
    db.run(`INSERT INTO notes (title, content, category, subCategory, tags, exampleTickets, slackChannel, macro, faqReference, dateCreated, lastUpdated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, content || '', category || '', subCategory || '', tags || '', exampleTickets || '', slackChannel || '', macro || 'No', faqReference || '', now, now],
    function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        db.get('SELECT * FROM notes WHERE id = ?', [this.lastID], (err, row) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
                return;
            }
            
            // ADDED: Sync latest note creation to cross-device
            crossDevice.writeData('latest-note-created', {
                title: row.title,
                id: row.id,
                timestamp: now,
                category: row.category
            });
            
            res.json({ success: true, data: row });
        });
    });
});

app.put('/api/notes/:id', (req, res) => {
    const noteId = req.params.id;
    const { title, content, category, subCategory, tags, exampleTickets, slackChannel, macro, faqReference } = req.body;
    
    const now = new Date().toISOString();
    
    db.run(`UPDATE notes SET title = ?, content = ?, category = ?, subCategory = ?, tags = ?, exampleTickets = ?, slackChannel = ?, macro = ?, faqReference = ?, lastUpdated = ? WHERE id = ?`,
    [title, content || '', category || '', subCategory || '', tags || '', exampleTickets || '', slackChannel || '', macro || 'No', faqReference || '', now, noteId],
    function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        db.get('SELECT * FROM notes WHERE id = ?', [noteId], (err, row) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
                return;
            }
            
            // ADDED: Sync note update to cross-device
            crossDevice.writeData('latest-note-updated', {
                title: row.title,
                id: row.id,
                timestamp: now
            });
            
            res.json({ success: true, data: row });
        });
    });
});

app.delete('/api/notes/:id', (req, res) => {
    const noteId = req.params.id;
    
    db.run('DELETE FROM notes WHERE id = ?', [noteId], function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        // ADDED: Sync deletion info to cross-device
        crossDevice.writeData('latest-note-deleted', {
            id: noteId,
            timestamp: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'Note deleted successfully' });
    });
});

app.delete('/api/notes/bulk-delete', (req, res) => {
    db.run('DELETE FROM notes', function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        // ADDED: Sync bulk deletion to cross-device
        crossDevice.writeData('notes-bulk-deleted', {
            count: this.changes,
            timestamp: new Date().toISOString()
        });
        
        res.json({ success: true, message: this.changes + ' notes deleted successfully' });
    });
});

// ===== BUGS API =====
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Server is running' });
});

app.get('/api/bugs', (req, res) => {
    db.all('SELECT * FROM bug_tracker ORDER BY createdAt DESC', (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        // ADDED: Sync bugs count to cross-device
        crossDevice.writeData('bugs-count', rows.length);
        crossDevice.writeData('last-bugs-access', new Date().toISOString());
        
        res.json({ success: true, data: rows });
    });
});

app.post('/api/bugs', (req, res) => {
    const { dateCreated, timeStamp, queue, summary, status, agent, product, priority, department, tickets, slackUrl, notionUrl, comments, lastUpdated, lastUpdatedTimeStamp } = req.body;
    
    if (!summary) {
        res.status(400).json({ success: false, error: 'Summary is required' });
        return;
    }
    
    db.run(`INSERT INTO bug_tracker (dateCreated, timeStamp, queue, summary, status, agent, product, priority, department, tickets, slackUrl, notionUrl, comments, lastUpdated, lastUpdatedTimeStamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [dateCreated || '', timeStamp || '', queue || '', summary, status || 'Not started', agent || '', product || '', priority || 'P4', department || '', tickets || '', slackUrl || '', notionUrl || '', comments || '', lastUpdated || '', lastUpdatedTimeStamp || ''],
    function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        db.get('SELECT * FROM bug_tracker WHERE id = ?', [this.lastID], (err, row) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
                return;
            }
            
            // ADDED: Sync new bug to cross-device
            crossDevice.writeData('latest-bug-created', {
                summary: row.summary,
                id: row.id,
                status: row.status,
                priority: row.priority,
                timestamp: new Date().toISOString()
            });
            
            res.json({ success: true, data: row });
        });
    });
});

app.put('/api/bugs/:id', (req, res) => {
    const bugId = req.params.id;
    const { dateCreated, timeStamp, queue, summary, status, agent, product, priority, department, tickets, slackUrl, notionUrl, comments, lastUpdated, lastUpdatedTimeStamp } = req.body;
    
    db.run(`UPDATE bug_tracker SET dateCreated = ?, timeStamp = ?, queue = ?, summary = ?, status = ?, agent = ?, product = ?, priority = ?, department = ?, tickets = ?, slackUrl = ?, notionUrl = ?, comments = ?, lastUpdated = ?, lastUpdatedTimeStamp = ? WHERE id = ?`,
    [dateCreated || '', timeStamp || '', queue || '', summary || '', status || 'Not started', agent || '', product || '', priority || 'P4', department || '', tickets || '', slackUrl || '', notionUrl || '', comments || '', lastUpdated || '', lastUpdatedTimeStamp || '', bugId],
    function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        db.get('SELECT * FROM bug_tracker WHERE id = ?', [bugId], (err, row) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
                return;
            }
            
            // ADDED: Sync bug update to cross-device
            crossDevice.writeData('latest-bug-updated', {
                summary: row.summary,
                id: row.id,
                status: row.status,
                timestamp: new Date().toISOString()
            });
            
            res.json({ success: true, data: row });
        });
    });
});

app.delete('/api/bugs/:id', (req, res) => {
    const bugId = req.params.id;
    
    db.run('DELETE FROM bug_tracker WHERE id = ?', [bugId], function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        // ADDED: Sync bug deletion to cross-device
        crossDevice.writeData('latest-bug-deleted', {
            id: bugId,
            timestamp: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'Bug deleted successfully' });
    });
});

app.delete('/api/bugs/bulk-delete', (req, res) => {
    db.run('DELETE FROM bugs', function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        // ADDED: Sync bulk bug deletion to cross-device
        crossDevice.writeData('bugs-bulk-deleted', {
            count: this.changes,
            timestamp: new Date().toISOString()
        });
        
        res.json({ success: true, message: this.changes + ' bugs deleted successfully' });
    });
});

// ===== TICKETS API =====
app.get('/api/tickets', (req, res) => {
    db.all('SELECT * FROM tickets ORDER BY createdAt DESC', (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        // ADDED: Sync tickets count to cross-device
        crossDevice.writeData('tickets-count', rows.length);
        crossDevice.writeData('last-tickets-access', new Date().toISOString());
        
        res.json({ success: true, data: rows });
    });
});

app.post('/api/tickets', (req, res) => {
    const { dateCreated, timeStamp, ticketNo, issue, status, agent, product, queue, timesReplied, category, department, slackUrl, notionUrl, comments, lastUpdated, lastUpdatedTimeStamp } = req.body;
    
    if (!ticketNo || !issue) {
        res.status(400).json({ success: false, error: 'Ticket number and issue are required' });
        return;
    }
    
    db.run(`INSERT INTO tickets (dateCreated, timeStamp, ticketNo, issue, status, agent, product, queue, timesReplied, category, department, slackUrl, notionUrl, comments, lastUpdated, lastUpdatedTimeStamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [dateCreated || '', timeStamp || '', ticketNo, issue, status || 'Open', agent || '', product || '', queue || '', parseInt(timesReplied) || 0, category || '', department || '', slackUrl || '', notionUrl || '', comments || '', lastUpdated || '', lastUpdatedTimeStamp || ''],
    function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                res.status(400).json({ success: false, error: 'Ticket number already exists' });
            } else {
                res.status(500).json({ success: false, error: err.message });
            }
            return;
        }
        
        db.get('SELECT * FROM tickets WHERE id = ?', [this.lastID], (err, row) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
                return;
            }
            
            // ADDED: Sync new ticket to cross-device
            crossDevice.writeData('latest-ticket-created', {
                ticketNo: row.ticketNo,
                issue: row.issue,
                id: row.id,
                status: row.status,
                timestamp: new Date().toISOString()
            });
            
            res.json({ success: true, data: row });
        });
    });
});

app.put('/api/tickets/:id', (req, res) => {
    const ticketId = req.params.id;
    const { issue, status, agent, timesReplied, department, comments, lastUpdated, lastUpdatedTimeStamp } = req.body;
    
    db.run(`UPDATE tickets SET issue = ?, status = ?, agent = ?, timesReplied = ?, department = ?, comments = ?, lastUpdated = ?, lastUpdatedTimeStamp = ? WHERE id = ?`,
    [issue || '', status || 'Open', agent || '', parseInt(timesReplied) || 0, department || 'Engineering', comments || '', lastUpdated || '', lastUpdatedTimeStamp || '', ticketId],
    function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ success: false, error: 'Ticket not found' });
            return;
        }
        
        db.get('SELECT * FROM tickets WHERE id = ?', [ticketId], (err, row) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
                return;
            }
            
            // ADDED: Sync ticket update to cross-device
            crossDevice.writeData('latest-ticket-updated', {
                ticketNo: row.ticketNo,
                id: row.id,
                status: row.status,
                timestamp: new Date().toISOString()
            });
            
            res.json({ success: true, data: row });
        });
    });
});

app.delete('/api/tickets/:id', (req, res) => {
    const ticketId = req.params.id;
    
    db.run('DELETE FROM tickets WHERE id = ?', [ticketId], function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        // ADDED: Sync ticket deletion to cross-device
        crossDevice.writeData('latest-ticket-deleted', {
            id: ticketId,
            timestamp: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'Ticket deleted successfully' });
    });
});

app.delete('/api/tickets/bulk-delete', (req, res) => {
    db.run('DELETE FROM tickets', function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
            return;
        }
        
        // ADDED: Sync bulk ticket deletion to cross-device
        crossDevice.writeData('tickets-bulk-deleted', {
            count: this.changes,
            timestamp: new Date().toISOString()
        });
        
        res.json({ success: true, message: this.changes + ' tickets deleted successfully' });
    });
});

// ADDED: New cross-device status endpoint
app.get('/api/cross-device-status', (req, res) => {
    const status = {
        notesCount: crossDevice.readData('notes-count') || 0,
        bugsCount: crossDevice.readData('bugs-count') || 0,
        ticketsCount: crossDevice.readData('tickets-count') || 0,
        lastActivity: {
            notes: crossDevice.readData('last-notes-access'),
            bugs: crossDevice.readData('last-bugs-access'),
            tickets: crossDevice.readData('last-tickets-access')
        },
        latestUpdates: {
            note: crossDevice.readData('latest-note-created'),
            bug: crossDevice.readData('latest-bug-created'),
            ticket: crossDevice.readData('latest-ticket-created')
        }
    };
    
    res.json({ success: true, data: status });
});

// ===== HTML PAGES - UPDATED WITH CLEAN URLS =====
// Root redirects to notes
app.get('/', (req, res) => {
    res.redirect('/notes');
});

// CHANGED: Clean URL routes
app.get('/notes', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/bugs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bugs.html'));
});

app.get('/tickets', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tickets.html'));
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Note Tracker Server running on http://localhost' + (PORT === 80 ? '' : ':' + PORT));
    console.log('📝 Notes: http://localhost/notes');
    console.log('🐛 Bugs: http://localhost/bugs');
    console.log('🎫 Tickets: http://localhost/tickets');
    
    // ADDED: Cross-device status
    console.log('🌐 Cross-device sync: ENABLED');
    console.log('📊 Status: http://localhost/api/cross-device-status');
    console.log('✅ All systems working!');
    
    // ADDED: Store server startup info
    crossDevice.writeData('server-status', {
        started: new Date().toISOString(),
        port: PORT,
        status: 'running'
    });
});

process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    
    // ADDED: Store shutdown info
    crossDevice.writeData('server-status', {
        shutdown: new Date().toISOString(),
        status: 'stopped'
    });
    
    db.close();
    process.exit(0);
});