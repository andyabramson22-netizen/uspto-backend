// server.js - USPTO Data Backend Server (Enhanced APIs)
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS for all origins
app.use(cors());
app.use(express.json());

// Cache to avoid hitting USPTO APIs too frequently
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Helper function to get cached data
function getCached(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`Cache hit for: ${key}`);
        return cached.data;
    }
    return null;
}

// Helper function to set cache
function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
    console.log(`Cache set for: ${key}`);
}

// Create axios instance that ignores SSL errors (for USPTO APIs)
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false
    }),
    timeout: 20000
});

// Search Patents Endpoint - Enhanced
app.get('/api/patents/search', async (req, res) => {
    const { assignee } = req.query;
    
    if (!assignee) {
        return res.status(400).json({ error: 'Assignee parameter required' });
    }

    console.log(`Patent search request for: ${assignee}`);

    const cacheKey = `patents:${assignee.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) {
        return res.json(cached);
    }

    try {
        let allPatents = [];

        // Method 1: Try USPTO Patent Examination Data System (PEDS)
        try {
            console.log('Trying USPTO PEDS API...');
            const pedsUrl = 'https://ped.uspto.gov/api/queries';
            const pedsResponse = await axiosInstance.post(pedsUrl, {
                searchText: `(AN/"${assignee}")`,
                qf: 'patentTitle',
                fl: '*',
                facet: true,
                sort: 'applId desc',
                start: 0,
                rows: 100
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (pedsResponse.data?.queryResults?.searchResponse?.response?.docs) {
                const docs = pedsResponse.data.queryResults.searchResponse.response.docs;
                console.log(`PEDS returned ${docs.length} results`);
                allPatents = docs.map(p => ({
                    patent_number: p.patentNumber || p.appEarlyPubNumber || p.applicationNumberText,
                    patent_title: p.inventionTitle || p.patentTitle,
                    app_date: p.appFilingDate,
                    patent_date: p.patentIssueDate,
                    status: p.appStatus || (p.patentIssueDate ? 'Granted' : 'Pending'),
                    type: p.appType
                }));
            }
        } catch (pedsError) {
            console.log('PEDS API failed:', pedsError.message);
        }

        // Method 2: Try PatentsView API (for granted patents)
        if (allPatents.length === 0) {
            try {
                console.log('Trying PatentsView API...');
                const pvQuery = {
                    "_or": [
                        { "assignee_organization": assignee },
                        { "_text_any": { "assignee_organization": assignee } }
                    ]
                };
                
                const pvUrl = 'https://api.patentsview.org/patents/query';
                const pvResponse = await axiosInstance.get(pvUrl, {
                    params: {
                        q: JSON.stringify(pvQuery),
                        f: '["patent_number","patent_title","patent_date","app_date","assignee_organization"]',
                        o: '{"per_page":100}'
                    }
                });

                if (pvResponse.data?.patents?.length > 0) {
                    console.log(`PatentsView returned ${pvResponse.data.patents.length} results`);
                    allPatents = pvResponse.data.patents.map(p => ({
                        ...p,
                        status: p.patent_date ? 'Granted' : 'Pending'
                    }));
                }
            } catch (pvError) {
                console.log('PatentsView API failed:', pvError.message);
            }
        }

        // Method 3: Try USPTO Public Search (web scraping alternative)
        if (allPatents.length === 0) {
            console.log('Trying USPTO Public Patent Search...');
            // This would require more complex scraping - skipping for now
        }

        if (allPatents.length > 0) {
            const granted = allPatents.filter(p => p.patent_date).length;
            const result = {
                total: allPatents.length,
                granted: granted,
                applications: allPatents.length - granted,
                list: allPatents,
                source: 'uspto_api'
            };

            setCache(cacheKey, result);
            return res.json(result);
        }

        // No results found
        console.log(`No patents found for: ${assignee}`);
        res.json({ 
            total: 0, 
            granted: 0, 
            applications: 0, 
            list: [], 
            source: 'none',
            message: 'No patents found. This could mean: (1) No patents/applications filed, (2) Patents under different legal name, (3) API limitations for pending applications'
        });

    } catch (error) {
        console.error('Patent search error:', error.message);
        res.json({ 
            total: 0, 
            granted: 0, 
            applications: 0, 
            list: [],
            source: 'error',
            error: error.message 
        });
    }
});

// Search Trademarks Endpoint - Enhanced
app.get('/api/trademarks/search', async (req, res) => {
    const { owner } = req.query;
    
    if (!owner) {
        return res.status(400).json({ error: 'Owner parameter required' });
    }

    console.log(`Trademark search request for: ${owner}`);

    const cacheKey = `trademarks:${owner.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) {
        return res.json(cached);
    }

    try {
        let allTrademarks = [];

        // Method 1: Try USPTO TSDR Status API
        try {
            console.log('Trying USPTO TSDR API...');
            const tsdrUrl = 'https://tsdr.uspto.gov/statusview/search';
            const tsdrResponse = await axiosInstance.get(tsdrUrl, {
                params: {
                    q: owner,
                    rows: 100,
                    wt: 'json'
                }
            });

            if (tsdrResponse.data?.response?.docs?.length > 0) {
                const docs = tsdrResponse.data.response.docs;
                console.log(`TSDR returned ${docs.length} results`);
                allTrademarks = docs.map(tm => ({
                    serialNumber: tm.applicationSerialNumber || tm.registrationNumber,
                    mark: tm.markLiteralElementText || tm.markDrawingCode,
                    filingDate: tm.applicationFilingDate,
                    status: tm.markCurrentStatusExternalDescriptionText,
                    owner: tm.ownerName
                }));
            }
        } catch (tsdrError) {
            console.log('TSDR API failed:', tsdrError.message);
        }

        // Method 2: Try alternative trademark search
        if (allTrademarks.length === 0) {
            console.log('Trying USPTO Trademark Status & Document Retrieval...');
            // Additional methods could be added here
        }

        if (allTrademarks.length > 0) {
            const registered = allTrademarks.filter(tm => 
                tm.status && tm.status.toLowerCase().includes('registered')
            ).length;

            const result = {
                total: allTrademarks.length,
                registered: registered,
                applications: allTrademarks.length - registered,
                list: allTrademarks,
                source: 'uspto_api'
            };

            setCache(cacheKey, result);
            return res.json(result);
        }

        // No results found
        console.log(`No trademarks found for: ${owner}`);
        res.json({ 
            total: 0, 
            registered: 0, 
            applications: 0, 
            list: [], 
            source: 'none',
            message: 'No trademarks found. Try exact legal entity name (e.g., "Company Inc.", "Company LLC")'
        });

    } catch (error) {
        console.error('Trademark search error:', error.message);
        res.json({ 
            total: 0, 
            registered: 0, 
            applications: 0, 
            list: [],
            source: 'error',
            error: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        cacheSize: cache.size 
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'USPTO IP Portfolio Backend',
        version: '2.0.0',
        endpoints: {
            patents: '/api/patents/search?assignee=CompanyName',
            trademarks: '/api/trademarks/search?owner=CompanyName',
            health: '/health'
        },
        note: 'Enhanced with multiple USPTO data sources for better coverage'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 USPTO Backend Server running on port ${PORT}`);
    console.log(`📍 Patent API: /api/patents/search?assignee=YourCompany`);
    console.log(`📍 Trademark API: /api/trademarks/search?owner=YourCompany`);
    console.log(`💚 Health Check: /health`);
    console.log(`🔍 Enhanced with multiple data sources for better coverage`);
});
