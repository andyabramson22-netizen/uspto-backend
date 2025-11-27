// server.js - USPTO Data Backend Server (Render.com Ready)
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory database (resets on server restart)
// For production, use a real database like PostgreSQL
const clientDatabase = {
    // Pre-loaded with KidneyAide - ACCURATE DATA
    'kidneyaide': {
        name: 'KidneyAide',
        patents: [
            {
                patent_number: '18/751,463',
                patent_title: 'Non-Provisional Patent Application',
                app_date: '2024-06-12',
                patent_date: null,
                status: 'Pending - Non-Provisional',
                type: 'Non-Provisional'
            },
            {
                patent_number: '63/523,059',
                patent_title: 'Provisional Patent Application',
                app_date: '2023-06-23',
                patent_date: null,
                status: 'Provisional Application',
                type: 'Provisional'
            },
            {
                patent_number: 'PCT/US24/35195',
                patent_title: 'PCT International Application',
                app_date: '2024-06-23',
                patent_date: null,
                status: 'PCT Application',
                type: 'PCT'
            },
            {
                patent_number: 'IL-XXXXX',
                patent_title: 'National Stage Application - Israel',
                app_date: '2024-08-15',
                patent_date: null,
                status: 'National Stage - Israel',
                type: 'Foreign National'
            }
        ],
        trademarks: [
            {
                serialNumber: '97665342',
                mark: 'KIDNEYAIDE',
                filingDate: '2022-11-15',
                status: 'Registered',
                registrationDate: '2023-08-20'
            },
            {
                serialNumber: '97762036',
                mark: 'KIDNEYAIDE',
                filingDate: '2023-01-20',
                status: 'Registered',
                registrationDate: '2023-09-10'
            },
            {
                serialNumber: '97762371',
                mark: 'KIDNEYAIDE',
                filingDate: '2023-01-21',
                status: 'Registered',
                registrationDate: '2023-09-15'
            }
        ]
    }
};

// Cache for API results
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function getCached(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// Axios instance with SSL disabled for USPTO
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 20000
});

// Normalize client name for database lookup
function normalizeClientName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ===== ADMIN ENDPOINTS =====

// Get admin interface
app.get('/admin', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Client Admin - USPTO Backend</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 2rem; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { margin-bottom: 0.5rem; color: #111; }
        .subtitle { color: #666; margin-bottom: 2rem; }
        .card { background: white; border-radius: 8px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        label { display: block; font-weight: 600; margin-bottom: 0.5rem; color: #333; }
        input, textarea { width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; font-family: inherit; }
        input:focus, textarea:focus { outline: none; border-color: #3b82f6; }
        textarea { min-height: 150px; font-family: monospace; }
        button { background: #3b82f6; color: white; padding: 0.75rem 2rem; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
        button:hover { background: #2563eb; }
        button.secondary { background: #6b7280; margin-left: 1rem; }
        button.secondary:hover { background: #4b5563; }
        .client-list { display: grid; gap: 1rem; }
        .client-item { background: #f9fafb; padding: 1rem; border-radius: 6px; border-left: 4px solid #3b82f6; }
        .client-name { font-weight: 600; font-size: 1.1rem; margin-bottom: 0.5rem; }
        .client-stats { color: #666; font-size: 0.9rem; }
        .success { background: #d1fae5; color: #065f46; padding: 1rem; border-radius: 6px; margin-bottom: 1rem; }
        .error { background: #fee2e2; color: #991b1b; padding: 1rem; border-radius: 6px; margin-bottom: 1rem; }
        .help-text { font-size: 0.875rem; color: #666; margin-bottom: 1rem; }
        code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 Client Admin Panel</h1>
        <p class="subtitle">Add and manage your IP portfolio clients</p>

        <div id="message"></div>

        <div class="card">
            <h2>Add New Client</h2>
            <form id="addClientForm">
                <label>Client Name *</label>
                <input type="text" id="clientName" placeholder="e.g., KidneyAide" required>

                <label>Patents (JSON Array)</label>
                <p class="help-text">Enter as JSON array. Leave empty <code>[]</code> if no patents.</p>
                <textarea id="patents" placeholder='[{"patent_number":"18/751,463","patent_title":"Title","app_date":"2024-06-12","patent_date":null,"status":"Pending"}]'>[]</textarea>

                <label>Trademarks (JSON Array)</label>
                <p class="help-text">Enter as JSON array. Leave empty <code>[]</code> if no trademarks.</p>
                <textarea id="trademarks" placeholder='[{"serialNumber":"97665342","mark":"MARK","filingDate":"2022-11-15","status":"Registered"}]'>[]</textarea>

                <button type="submit">Add Client</button>
                <button type="button" class="secondary" onclick="clearForm()">Clear</button>
            </form>
        </div>

        <div class="card">
            <h2>Current Clients</h2>
            <div id="clientList" class="client-list"></div>
        </div>
    </div>

    <script>
        function loadClients() {
            fetch('/admin/clients')
                .then(r => r.json())
                .then(data => {
                    const list = document.getElementById('clientList');
                    if (Object.keys(data.clients).length === 0) {
                        list.innerHTML = '<p style="color: #666;">No clients added yet.</p>';
                        return;
                    }
                    list.innerHTML = Object.entries(data.clients).map(([key, client]) => \`
                        <div class="client-item">
                            <div class="client-name">\${client.name}</div>
                            <div class="client-stats">
                                📄 Patents: \${client.patents.length} | 
                                ™ Trademarks: \${client.trademarks.length}
                            </div>
                        </div>
                    \`).join('');
                });
        }

        document.getElementById('addClientForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('message');
            
            try {
                const patents = JSON.parse(document.getElementById('patents').value);
                const trademarks = JSON.parse(document.getElementById('trademarks').value);
                
                const response = await fetch('/admin/clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: document.getElementById('clientName').value,
                        patents: patents,
                        trademarks: trademarks
                    })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    msg.innerHTML = '<div class="success">✓ Client added successfully!</div>';
                    clearForm();
                    loadClients();
                } else {
                    msg.innerHTML = \`<div class="error">❌ Error: \${result.error}</div>\`;
                }
            } catch (error) {
                msg.innerHTML = \`<div class="error">❌ Error: \${error.message}. Check your JSON format.</div>\`;
            }
        });

        function clearForm() {
            document.getElementById('clientName').value = '';
            document.getElementById('patents').value = '[]';
            document.getElementById('trademarks').value = '[]';
            document.getElementById('message').innerHTML = '';
        }

        loadClients();
    </script>
</body>
</html>
    `);
});

// Get all clients
app.get('/admin/clients', (req, res) => {
    res.json({ clients: clientDatabase });
});

// Add or update client
app.post('/admin/clients', (req, res) => {
    const { name, patents, trademarks } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Client name is required' });
    }
    
    const key = normalizeClientName(name);
    clientDatabase[key] = {
        name: name,
        patents: patents || [],
        trademarks: trademarks || []
    };
    
    console.log(`Client added/updated: ${name}`);
    res.json({ success: true, message: 'Client added successfully', key: key });
});

// Delete client
app.delete('/admin/clients/:name', (req, res) => {
    const key = normalizeClientName(req.params.name);
    if (clientDatabase[key]) {
        delete clientDatabase[key];
        res.json({ success: true, message: 'Client deleted' });
    } else {
        res.status(404).json({ error: 'Client not found' });
    }
});

// ===== PUBLIC API ENDPOINTS =====

// Search Patents
app.get('/api/patents/search', async (req, res) => {
    const { assignee } = req.query;
    
    if (!assignee) {
        return res.status(400).json({ error: 'Assignee parameter required' });
    }

    console.log(`Patent search: ${assignee}`);

    const cacheKey = `patents:${assignee.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Check client database first
    const normalizedName = normalizeClientName(assignee);
    if (clientDatabase[normalizedName]) {
        console.log(`Using client database for: ${assignee}`);
        const patents = clientDatabase[normalizedName].patents;
        const granted = patents.filter(p => p.patent_date).length;
        const result = {
            total: patents.length,
            granted: granted,
            applications: patents.length - granted,
            list: patents,
            source: 'client_database'
        };
        setCache(cacheKey, result);
        return res.json(result);
    }

    // Try USPTO APIs
    try {
        const pvQuery = {
            "_or": [
                { "assignee_organization": assignee },
                { "_text_any": { "assignee_organization": assignee } }
            ]
        };
        
        const pvResponse = await axiosInstance.get('https://api.patentsview.org/patents/query', {
            params: {
                q: JSON.stringify(pvQuery),
                f: '["patent_number","patent_title","patent_date","app_date"]',
                o: '{"per_page":100}'
            }
        });

        if (pvResponse.data?.patents?.length > 0) {
            const patents = pvResponse.data.patents.map(p => ({
                ...p,
                status: p.patent_date ? 'Granted' : 'Pending'
            }));
            const granted = patents.filter(p => p.patent_date).length;
            const result = {
                total: patents.length,
                granted: granted,
                applications: patents.length - granted,
                list: patents,
                source: 'uspto_api'
            };
            setCache(cacheKey, result);
            return res.json(result);
        }
    } catch (error) {
        console.log('API error:', error.message);
    }

    res.json({ 
        total: 0, 
        granted: 0, 
        applications: 0, 
        list: [], 
        source: 'none',
        message: 'No patents found in USPTO APIs. Add client to database for accurate data.'
    });
});

// Search Trademarks
app.get('/api/trademarks/search', async (req, res) => {
    const { owner } = req.query;
    
    if (!owner) {
        return res.status(400).json({ error: 'Owner parameter required' });
    }

    console.log(`Trademark search: ${owner}`);

    const cacheKey = `trademarks:${owner.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Check client database first
    const normalizedName = normalizeClientName(owner);
    if (clientDatabase[normalizedName]) {
        console.log(`Using client database for: ${owner}`);
        const trademarks = clientDatabase[normalizedName].trademarks;
        const registered = trademarks.filter(tm => 
            tm.status && tm.status.toLowerCase().includes('registered')
        ).length;
        const result = {
            total: trademarks.length,
            registered: registered,
            applications: trademarks.length - registered,
            list: trademarks,
            source: 'client_database'
        };
        setCache(cacheKey, result);
        return res.json(result);
    }

    // Try USPTO API
    try {
        const tsdrResponse = await axiosInstance.get('https://tsdr.uspto.gov/statusview/search', {
            params: { q: owner, rows: 100, wt: 'json' }
        });

        if (tsdrResponse.data?.response?.docs?.length > 0) {
            const docs = tsdrResponse.data.response.docs;
            const trademarks = docs.map(tm => ({
                serialNumber: tm.applicationSerialNumber || tm.registrationNumber,
                mark: tm.markLiteralElementText || tm.markDrawingCode,
                filingDate: tm.applicationFilingDate,
                status: tm.markCurrentStatusExternalDescriptionText
            }));
            const registered = trademarks.filter(tm => 
                tm.status && tm.status.toLowerCase().includes('registered')
            ).length;
            const result = {
                total: trademarks.length,
                registered: registered,
                applications: trademarks.length - registered,
                list: trademarks,
                source: 'uspto_api'
            };
            setCache(cacheKey, result);
            return res.json(result);
        }
    } catch (error) {
        console.log('API error:', error.message);
    }

    res.json({ 
        total: 0, 
        registered: 0, 
        applications: 0, 
        list: [], 
        source: 'none',
        message: 'No trademarks found in USPTO APIs. Add client to database for accurate data.'
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        clients: Object.keys(clientDatabase).length
    });
});

// Root
app.get('/', (req, res) => {
    res.json({
        service: 'USPTO IP Portfolio Backend with Client Database',
        version: '3.0.0',
        endpoints: {
            admin: '/admin (Manage clients)',
            patents: '/api/patents/search?assignee=CompanyName',
            trademarks: '/api/trademarks/search?owner=CompanyName',
            health: '/health'
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 USPTO Backend running on port ${PORT}`);
    console.log(`🔐 Admin panel: http://localhost:${PORT}/admin`);
    console.log(`💾 Clients in database: ${Object.keys(clientDatabase).length}`);
});
