let memoryData = null;

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method === 'POST') {
        try {
            memoryData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            return res.status(200).json({ success: true, timestamp: Date.now() });
        } catch(e) {
            return res.status(400).json({ error: e.message });
        }
    }

    if (req.method === 'GET') {
        if (memoryData) return res.status(200).json(memoryData);
        return res.status(200).json({ exists: false });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
