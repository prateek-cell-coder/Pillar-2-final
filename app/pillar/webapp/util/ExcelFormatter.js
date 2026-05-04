sap.ui.define([], () => {
    "use strict";

    const EXPECTED_COLUMNS = [
        "Asset","SNo","AssetClass","CapitalizedOn","DeactDate","Use",
        "AssetDescription","BSAcctAPC","Retirement","DeprRetired",
        "RetBookValue","RetRevenue","Loss","Gain","Crcy","TType",
        "Document","Text","Reference","System","TicketNumber","InvoiceID"
    ];

    const get = (arr, idx) => (arr[idx] || "").trim();

    function cleanNumber(val) {
        if (!val || String(val).trim() === "") return "0,00";
        return String(val).trim();
    }

    function extractInvoiceID(text) {
        if (!text || !text.trim()) return "";

        const words = text.trim().split(/\s+/);
        const last  = words[words.length - 1];

        if (/^\d+$/.test(last) && words.length >= 2 && words[words.length - 2].toUpperCase() === "SD") {
            return "SD" + last;
        }

        return last;
    }

    // Extract System (first word) and TicketNumber (first number after first word) from Text
    // e.g. "SSF 8006440217 KOSH PG V376 SD 20673688"  → System="SSF", TicketNumber="8006440217"
    // e.g. "SD20673711"                                 → System="SD",  TicketNumber="20673711"
    function extractSystemAndTicket(text) {
        if (!text || !text.trim()) return { system: "", ticketNumber: "" };

        const t = text.trim();

        // Pattern 1: WORD<space>NUMBER  e.g. "SSF 8006440217 ..."
        const spaceMatch = t.match(/^([A-Za-z]+)\s+(\d+)/);
        if (spaceMatch) {
            return { system: spaceMatch[1], ticketNumber: spaceMatch[2] };
        }

        // Pattern 2: WORD immediately followed by NUMBER e.g. "SD20673711"
        const glueMatch = t.match(/^([A-Za-z]+)(\d+)/);
        if (glueMatch) {
            return { system: glueMatch[1], ticketNumber: glueMatch[2] };
        }

        // Fallback: first word only, no number found
        const firstWord = t.split(/[\s,]+/)[0];
        return { system: firstWord, ticketNumber: "" };
    }

    function parseSAPFile(text) {
        const lines = text.split(/\r?\n/);
        const rows  = [];
        let i = 0;

        // Skip metadata lines — find first real data line
        while (i < lines.length) {
            const cols = lines[i].split("\t");
            if (cols[0].trim() === "" && cols.length > 1 && /^\d+$/.test(cols[1].trim())) {
                break;
            }
            i++;
        }

        while (i < lines.length) {
            const c1 = (lines[i]     || "").split("\t");
            const c2 = (lines[i + 1] || "").split("\t");

            const asset = c1[1] ? c1[1].trim() : "";
            if (!asset || !/^\d+$/.test(asset)) { i++; continue; }

            const text = get(c2, 7);

            // Reference: col[14] if line2 is wide enough, else SD+number from Text
            let reference = "";
            if (c2.length >= 15 && get(c2, 14)) {
                reference = get(c2, 14);
            } else {
                const sdMatch = text.match(/SD\s*(\d[\d\-]+)/);
                reference = sdMatch ? sdMatch[1] : "";
            }

            const { system, ticketNumber } = extractSystemAndTicket(text);

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
                Text:             text,
                Reference:        reference,
                System:           system,
                TicketNumber:     ticketNumber,
                InvoiceID:        extractInvoiceID(text)
            });

            i += 3; // line1 + line2 + blank
        }

        return rows;
    }

    return {

        parseAndFormat(arrayBuffer) {
            const XLSX = window.XLSX;
            if (!XLSX) throw new Error("SheetJS library not loaded. Check index.html.");

            const uint8   = new Uint8Array(arrayBuffer);
            const isUTF16 = (uint8[0] === 0xFF && uint8[1] === 0xFE) ||
                            (uint8[0] === 0xFE && uint8[1] === 0xFF);

            if (isUTF16) {
                const text = new TextDecoder("utf-16").decode(arrayBuffer);
                const rows = parseSAPFile(text);
                if (!rows.length) throw new Error("No data rows found in file.");
                return rows;
            }

            // Standard xlsx fallback
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            const sheet    = workbook.Sheets[workbook.SheetNames[0]];
            const rawRows  = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            if (!rawRows.length) throw new Error("Excel file is empty.");
            return rawRows;
        },

        exportToExcel(rows, filename) {
            const XLSX = window.XLSX;
            if (!XLSX) throw new Error("SheetJS library not loaded.");
            const ws = XLSX.utils.json_to_sheet(rows, { header: EXPECTED_COLUMNS });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Pillar2");
            XLSX.writeFile(wb, filename);
        }
    };
});