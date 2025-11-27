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
        body { f
