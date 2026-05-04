const cds  = require('@sap/cds');
const XLSX = require('xlsx');

// ── Parse standard xlsx buffer ──
function parseXLSXBuffer(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rawRows || rawRows.length === 0) throw new Error('Excel file is empty');
    return rawRows;
}

// ── Parse SAP UTF-16 exported file ──
function parseSAPUTF16Buffer(buffer) {
    const text  = buffer.toString('utf16le');
    const lines = text.split(/\r?\n/);
    const rows  = [];
    let i       = 0;

    while (i < lines.length) {
        const cols = lines[i].split('\t');
        if (cols[0].trim() === '' && cols.length > 1 && /^\d+$/.test(cols[1].trim())) break;
        i++;
    }

    while (i < lines.length) {
        const c1    = (lines[i]     || '').split('\t');
        const c2    = (lines[i + 1] || '').split('\t');
        const asset = c1[1] ? c1[1].trim() : '';
        if (!asset || !/^\d+$/.test(asset)) { i++; continue; }

        const get         = (arr, idx) => (arr[idx] || '').trim();
        const cleanNumber = (val) => parseFloat(String(val || '0').replace(',', '.')) || 0;
        const txt         = get(c2, 7);

        let system = '', ticketNumber = '';
        const spaceMatch = txt.match(/^([A-Za-z]+)\s+(\d+)/);
        const glueMatch  = txt.match(/^([A-Za-z]+)(\d+)/);
        if (spaceMatch)     { system = spaceMatch[1]; ticketNumber = spaceMatch[2]; }
        else if (glueMatch) { system = glueMatch[1];  ticketNumber = glueMatch[2]; }
        else                { system = txt.split(/[\s,]+/)[0]; }

        const words     = txt.trim().split(/\s+/);
        const last      = words[words.length - 1];
        const invoiceID = (/^\d+$/.test(last) && words.length >= 2 &&
                          words[words.length - 2].toUpperCase() === 'SD')
                          ? 'SD' + last : last;

        let reference = '';
        if (c2.length >= 15 && get(c2, 14)) reference = get(c2, 14);
        else { const sdMatch = txt.match(/SD\s*(\d[\d\-]+)/); reference = sdMatch ? sdMatch[1] : ''; }

        rows.push({
            Asset:            get(c1, 1),
            SNo:              get(c1, 3),
            AssetClass:       get(c1, 6),
            CapitalizedOn:    get(c1, 9),
            DeactDate:        get(c1, 11),
            Use:              get(c1, 12),
            AssetDescription: get(c1, 13),
            BSAcctAPC:        get(c1, 16),
            Retirement:       cleanNumber(get(c1, 17)),
            DeprRetired:      cleanNumber(get(c1, 18)),
            RetBookValue:     cleanNumber(get(c1, 19)),
            RetRevenue:       cleanNumber(get(c1, 20)),
            Loss:             cleanNumber(get(c1, 21)),
            Gain:             cleanNumber(get(c1, 22)),
            Crcy:             get(c1, 23),
            TType:            get(c2, 1),
            Document:         get(c2, 2),
            Text:             txt,
            Reference:        reference,
            System:           system,
            TicketNumber:     ticketNumber,
            InvoiceID:        invoiceID
        });
        i += 3;
    }
    return rows;
}

module.exports = cds.service.impl(async function () {

    // ══════════════════════════════════════════════════
    // Trigger BPA — with detailed OAuth logging
    // ══════════════════════════════════════════════════
    this.on('triggerProcessAutomation', async (req) => {
        const {
            system, companyCode, deactivationFrom,
            deactivationTo, transactionType, depreciationArea, sortVariant
        } = req.data;

        try {
            // ── Get OAuth Token ──
            console.log('=== Starting OAuth token request ===');
            const tokenResponse = await fetch(
                'https://056af1cetrial.authentication.us10.hana.ondemand.com/oauth/token',
                {
                    method  : 'POST',
                    headers : { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body    : new URLSearchParams({
                        grant_type    : 'client_credentials',
                        client_id     : 'sb-49d797af-898f-408b-b016-7fce9365520c!b594567|xsuaa!b49390',
                        client_secret : 'f9aa4b4b-9af9-4e66-8e38-8e925f69c4b1$ZL7YR4B-7zq_FA6hAWS3GkpaRf_hP_WnShWKP4LW_Vg='
                    })
                }
            );

            console.log('OAuth response status:', tokenResponse.status);
            console.log('OAuth content-type:', tokenResponse.headers.get('content-type'));

            const responseText = await tokenResponse.text();
            console.log('OAuth response body (first 500 chars):', responseText.substring(0, 500));

            let tokenData;
            try {
                tokenData = JSON.parse(responseText);
            } catch (parseErr) {
                throw new Error(`OAuth server returned non-JSON (status ${tokenResponse.status}): ${responseText.substring(0, 200)}`);
            }

            const accessToken = tokenData.access_token;
            if (!accessToken) {
                throw new Error('No access_token in response: ' + JSON.stringify(tokenData));
            }

            console.log('OAuth token obtained successfully');

            // ── Call BPA API ──
            console.log('=== Calling BPA API ===');
            const bpaResponse = await fetch(
                'https://spa-api-gateway-bpi-us-prod.cfapps.us10.hana.ondemand.com/public/workflow/rest/v1/workflow-instances',
                {
                    method  : 'POST',
                    headers : {
                        'Content-Type'  : 'application/json',
                        'Authorization' : `Bearer ${accessToken}`
                    },
                    body : JSON.stringify({
                        definitionId : 'eu10.bosch-cidae4-s4x-dev.reportexport.reportExport',
                        context      : {
                            companycode          : companyCode,
                            system               : system,
                            deactivationfromdate : deactivationFrom,
                            deactivationtodate   : deactivationTo,
                            transactiontype      : transactionType,
                            depreciationarea     : depreciationArea,
                            sortvariant          : sortVariant
                        }
                    })
                }
            );

            const bpaText = await bpaResponse.text();
            console.log('BPA response status:', bpaResponse.status);
            console.log('BPA response body:', bpaText.substring(0, 500));

            if (!bpaResponse.ok) {
                throw new Error(`BPA returned ${bpaResponse.status}: ${bpaText.substring(0, 300)}`);
            }

            // ── Save trigger record ──
            const { ProcessAutomation } = cds.entities('com.bosch.pillar');
            await INSERT.into(ProcessAutomation).entries({
                system, companyCode, deactivationFrom,
                deactivationTo, transactionType, depreciationArea,
                sortVariant,
                status      : 'TRIGGERED',
                triggeredAt : new Date().toISOString(),
                triggeredBy : req.user?.id || 'anonymous'
            });

            return { success: true, message: 'BPA Process triggered successfully! Bot is now running.' };

        } catch (error) {
            console.error('BPA trigger failed:', error.message);
            return { success: false, message: `Failed to trigger BPA: ${error.message}` };
        }
    });

    // ══════════════════════════════════════════════════
    // receiveReport — BPA bot posts Excel here
    // ══════════════════════════════════════════════════
    this.on('receiveReport', async (req) => {
        const { fileName, fileContent, companyCode, system } = req.data;
        console.log(`Report received from BPA: ${fileName}`);

        try {
            const { UploadSession, AssetRetirementRow } = cds.entities('com.bosch.pillar');

            const buffer  = Buffer.from(fileContent, 'base64');
            const isUTF16 = (buffer[0] === 0xFF && buffer[1] === 0xFE) ||
                            (buffer[0] === 0xFE && buffer[1] === 0xFF);

            let rows = [];
            if (isUTF16) {
                console.log('SAP UTF-16 format detected');
                rows = parseSAPUTF16Buffer(buffer);
            } else {
                console.log('Standard xlsx format detected');
                rows = parseXLSXBuffer(buffer);
            }

            if (!rows || rows.length === 0) {
                return { success: false, message: 'No data rows found in file.', rowsSaved: 0 };
            }

            console.log(`Parsed ${rows.length} rows from ${fileName}`);

            const sessionId = cds.utils.uuid();
            await INSERT.into(UploadSession).entries({
                ID            : sessionId,
                fileName      : fileName,
                originalRows  : rows.length,
                formattedRows : rows.length,
                status        : 'FORMATTED'
            });

            const entries = rows.map(row => ({
                ID               : cds.utils.uuid(),
                session_ID       : sessionId,
                Asset            : String(row.Asset            || ''),
                SNo              : String(row.SNo              || ''),
                AssetClass       : String(row.AssetClass       || ''),
                CapitalizedOn    : String(row.CapitalizedOn    || ''),
                DeactDate        : String(row.DeactDate        || ''),
                Use              : String(row.Use              || ''),
                AssetDescription : String(row.AssetDescription || ''),
                BSAcctAPC        : String(row.BSAcctAPC        || ''),
                Retirement       : parseFloat(row.Retirement)  || 0,
                DeprRetired      : parseFloat(row.DeprRetired) || 0,
                RetBookValue     : parseFloat(row.RetBookValue)|| 0,
                RetRevenue       : parseFloat(row.RetRevenue)  || 0,
                Loss             : parseFloat(row.Loss)        || 0,
                Gain             : parseFloat(row.Gain)        || 0,
                Crcy             : String(row.Crcy             || ''),
                TType            : String(row.TType            || ''),
                Document         : String(row.Document         || ''),
                Text             : String(row.Text             || ''),
                Reference        : String(row.Reference        || ''),
                System           : String(row.System           || system || ''),
                TicketNumber     : String(row.TicketNumber     || ''),
                InvoiceID        : String(row.InvoiceID        || ''),
                wasReformatted   : true
            }));

            await INSERT.into(AssetRetirementRow).entries(entries);
            console.log(`Saved ${rows.length} rows to DB`);

            return {
                success   : true,
                message   : `Report received and formatted! ${rows.length} rows saved.`,
                rowsSaved : rows.length
            };

        } catch (error) {
            console.error('receiveReport failed:', error.message);
            return { success: false, message: `Failed: ${error.message}`, rowsSaved: 0 };
        }
    });

    // ══════════════════════════════════════════════════
    // Save formatted rows
    // ══════════════════════════════════════════════════
    this.on('saveFormattedRows', async (req) => {
        const { sessionID, rows } = req.data;
        if (!rows || rows.length === 0) {
            return { success: false, message: 'No rows provided.', rowsSaved: 0 };
        }
        const { UploadSession, AssetRetirementRow } = cds.entities('com.bosch.pillar');
        const entries = rows.map(r => ({ ...r, session_ID: sessionID, wasReformatted: true }));
        await INSERT.into(AssetRetirementRow).entries(entries);
        await UPDATE(UploadSession)
            .set({ formattedRows: rows.length, status: 'FORMATTED' })
            .where({ ID: sessionID });
        return { success: true, message: `${rows.length} rows saved successfully.`, rowsSaved: rows.length };
    });

    // ══════════════════════════════════════════════════
    // Export rows
    // ══════════════════════════════════════════════════
    this.on('exportRows', async (req) => {
        const { sessionID } = req.data;
        const { AssetRetirementRow } = cds.entities('com.bosch.pillar');
        return await SELECT.from(AssetRetirementRow).where({ session_ID: sessionID });
    });

    // ══════════════════════════════════════════════════
    // Get upload sessions
    // ══════════════════════════════════════════════════
    this.on('getUploadSessions', async () => {
        const { UploadSession } = cds.entities('com.bosch.pillar');
        return await SELECT.from(UploadSession)
            .columns('ID', 'fileName', 'originalRows', 'formattedRows', 'status', 'createdAt')
            .orderBy({ createdAt: 'desc' });
    });

});