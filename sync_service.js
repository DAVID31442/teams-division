const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SPREADSHEET_ID = '18lPDjVpmLDXoy6oKfy3oKMZ7E0wKnfBSdmskuKkLwQY';
const DATA_FILE = path.join(__dirname, 'teams_data.json');
const CSV_FILE = path.join(__dirname, 'teams_export.csv');

function generateCsv(data) {
    const rows = [['م', 'اسم العضو', 'المجموعة', 'الصفة', 'تاريخ التحديث']];
    let counter = 1;

    if (data && Array.isArray(data.groups)) {
        data.groups.forEach((group, gIdx) => {
            const groupTitle = (data.customTitles && data.customTitles[gIdx]) || (`المجموعة ${gIdx + 1}`);
            group.forEach(m => {
                rows.push([
                    counter++,
                    `"${(m.name || '').replace(/"/g, '""')}"`,
                    `"${groupTitle.replace(/"/g, '""')}"`,
                    m.locked ? 'قائد أساسي 👑' : 'عضو قرعة 🎲',
                    new Date().toLocaleDateString('ar-EG')
                ]);
            });
        });
    }

    const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n');
    fs.writeFileSync(CSV_FILE, csvContent, 'utf8');
    return rows.length - 1; // total members
}

function syncToGoogleSheets(data) {
    try {
        if (!data && fs.existsSync(DATA_FILE)) {
            data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
        if (!data) return { success: false, error: 'No data available' };

        const memberCount = generateCsv(data);

        // 1. Import CSV to Google Sheet
        const resImport = spawnSync('gsheets.cmd', [
            'mutate', 'import-csv',
            SPREADSHEET_ID,
            CSV_FILE,
            '--sheet', 'الورقة1'
        ], { encoding: 'utf8', shell: true });

        if (resImport.status !== 0) {
            console.error('[Google Sheets Sync Error]:', resImport.stderr || resImport.stdout);
            return { success: false, error: resImport.stderr || resImport.stdout };
        }

        // 2. Format Header Row
        spawnSync('gsheets.cmd', [
            'mutate', 'format',
            SPREADSHEET_ID,
            '--start-row', '0', '--end-row', '1',
            '--start-col', '0', '--end-col', '5',
            '--bold', '--bg-color', '#0d9488', '--fg-color', '#ffffff', '--align', 'CENTER'
        ], { encoding: 'utf8', shell: true });

        const timeStr = new Date().toLocaleTimeString('ar-EG');
        console.log(`[Google Sheets Sync] ✅ Successfully synced ${memberCount} members at ${timeStr}`);
        return { success: true, count: memberCount, time: timeStr };
    } catch (err) {
        console.error('[Google Sheets Sync Exception]:', err.message);
        return { success: false, error: err.message };
    }
}

if (require.main === module) {
    const res = syncToGoogleSheets();
    console.log('Result:', res);
}

module.exports = { syncToGoogleSheets, SPREADSHEET_ID };
