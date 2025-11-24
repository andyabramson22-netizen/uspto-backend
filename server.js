// server.js - USPTO Data Backend Server
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for your Framer site
app.use(cors());
app.use(express.json());

// Cache to avoid hitting USPTO APIs too frequently
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Helper function to get cached data
function getCached(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

// Helper function to set cache
function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// Search Patents Endpoint
app.get('/api/patents/search', async (req, res) => {
    const { assignee } = req.query;
    
    if (!assignee) {
        return res.status(400).json({ error: 'Assignee parameter required' });
    }

    const cacheKey = `patents:${assignee.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) {
        return res.json(cached);
    }

    try {
        // Try USPTO Patent Examination Data System (PEDS)
        const pedsUrl = `https://ped.uspto.gov/api/queries`;
        const pedsResponse = await axios.post(pedsUrl, {
            searchText: assignee,
            qf: "applId",
            fl: "*",
            mm: "100%",
            df: "patentTitle",
            facet: "true",
            sort: "applId asc",
            start: "0"
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        }).catch(() => null);

        if (pedsResponse && pedsResponse.data && pedsResponse.data.queryResults) {
            const results = pedsResponse.data.queryResults.searchResponse?.response?.docs || [];
            const formatted = results.map(p => ({
                patent_number: p.patentNumber || p.appEarlyPubNumber || p.applicationNumberText,
                patent_title: p.inventionTitle,
                app_date: p.appFilingDate,
                patent_date: p.patentIssueDate,
                status: p.appStatus || (p.patentIssueDate ? 'Granted' : 'Pending'),
                type: p.appType
            }));

            const granted = formatted.filter(p => p.patent_date).length;
            const result = {
                total: formatted.length,
                granted: granted,
                applications: formatted.length - granted,
                list: formatted
            };

            setCache(cacheKey, result);
            return res.json(result);
        }

        // Fallback to PatentsView API
        const pvQuery = {
            "_or": [
                { "assignee_organization": assignee },
                { "_text_any": { "assignee_organization": assignee } }
            ]
        };
        
        const pvUrl = `https://api.patentsview.org/patents/query`;
        const pvResponse = await axios.get(pvUrl, {
            params: {
                q: JSON.stringify(pvQuery),
                f: '["patent_number","patent_title","patent_date","app_date","assignee_organization"]',
                o: '{"per_page":100}'
            },
            timeout: 10000
        }).catch(() => null);

        if (pvResponse && pvResponse.data && pvResponse.data.patents) {
            const patents = pvResponse.data.patents;
            const formatted = patents.map(p => ({
                ...p,
                status: p.patent_date ? 'Granted' : 'Pending'
            }));

            const granted = formatted.filter(p => p.patent_date).length;
            const result = {
                total: formatted.length,
                granted: granted,
                applications: formatted.length - granted,
                list: formatted
            };

            setCache(cacheKey, result);
            return res.json(result);
        }

        // No results found
        res.json({ total: 0, granted: 0, applications: 0, list: [] });

    } catch (error) {
        console.error('Patent search error:', error.message);
        res.status(500).json({ 
            error: 'Failed to search patents',
            message: error.message 
        });
    }
});

// Search Trademarks Endpoint
app.get('/api/trademarks/search', async (req, res) => {
    const { owner } = req.query;
    
    if (!owner) {
        return res.status(400).json({ error: 'Owner parameter required' });
    }

    const cacheKey = `trademarks:${owner.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) {
        return res.json(cached);
    }

    try {
        // USPTO Trademark Status & Document Retrieval (TSDR) API
        // Note: This searches by text, not perfect but works
        const tsdrUrl = `https://tsdr.uspto.gov/statusview/search`;
        const tsdrResponse = await axios.get(tsdrUrl, {
            params: {
                q: owner,
                rows: 100,
                wt: 'json'
            },
            timeout: 10000
        }).catch(() => null);

        if (tsdrResponse && tsdrResponse.data && tsdrResponse.data.response) {
            const docs = tsdrResponse.data.response.docs || [];
            const formatted = docs.map(tm => ({
                serialNumber: tm.applicationSerialNumber || tm.registrationNumber,
                mark: tm.markLiteralElementText || tm.markDrawingCode,
                filingDate: tm.applicationFilingDate,
                status: tm.markCurrentStatusExternalDescriptionText,
                owner: tm.ownerName
            }));

            const registered = formatted.filter(tm => 
                tm.status && tm.status.toLowerCase().includes('registered')
            ).length;

            const result = {
                total: formatted.length,
                registered: registered,
                applications: formatted.length - registered,
                list: formatted
            };

            setCache(cacheKey, result);
            return res.json(result);
        }

        // No results found
        res.json({ total: 0, registered: 0, applications: 0, list: [] });

    } catch (error) {
        console.error('Trademark search error:', error.message);
        res.status(500).json({ 
            error: 'Failed to search trademarks',
            message: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`USPTO Backend Server running on port ${PORT}`);
    console.log(`Patent API: http://localhost:${PORT}/api/patents/search?assignee=YourCompany`);
    console.log(`Trademark API: http://localhost:${PORT}/api/trademarks/search?owner=YourCompany`);
});