sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/bosch/pillar/pillar/util/ExcelFormatter"
], (Controller, JSONModel, MessageToast, MessageBox, ExcelFormatter) => {
    "use strict";

    return Controller.extend("com.bosch.pillar.pillar.controller.Main", {

        onInit() {
            this.getView().setModel(new JSONModel({ rows: [] }), "tableModel");

            const oInput         = document.createElement("input");
            oInput.type          = "file";
            oInput.accept        = ".xlsx,.xls";
            oInput.style.display = "none";
            oInput.id            = "__pillarFileInput";
            oInput.addEventListener("change", this._onNativeFileChange.bind(this));
            document.body.appendChild(oInput);

            // ── NEW: Start polling for BPA posted data ──
            this._lastSessionId = null;
            this._startPolling();
        },

        // ── NEW: Poll every 10 seconds for new data from BPA ──
        _startPolling() {
            this._pollInterval = setInterval(async () => {
                try {
                    const res  = await fetch("/pillar2/UploadSessions?$orderby=createdAt%20desc&$top=1&$format=json");
                    const data = await res.json();
                    const latest = data.value?.[0];

                    // If new session found that we haven't loaded yet
                    if (latest && latest.ID !== this._lastSessionId && latest.status === 'FORMATTED') {
                        this._lastSessionId = latest.ID;
                        await this._loadRowsFromBPA(latest.ID, latest.fileName, latest.formattedRows);
                    }
                } catch (err) {
                    // Silent fail — polling should never crash the app
                    console.log("Polling:", err.message);
                }
            }, 10000);
        },

        // ── NEW: Load rows from DB into table ──
        async _loadRowsFromBPA(sessionId, fileName, rowCount) {
            try {
                const res  = await fetch(`/pillar2/AssetRows?$filter=session_ID eq ${sessionId}&$format=json`);
                const data = await res.json();
                const rows = data.value || [];

                if (rows.length > 0) {
                    this.getView().getModel("tableModel").setProperty("/rows", rows);
                    this.byId("uploadStatus").setVisible(true);
                    this.byId("uploadStatusText").setText(
                        `✅ Report received from BPA — "${fileName}" — ${rows.length} rows formatted automatically!`
                    );
                    MessageToast.show(`${rows.length} rows loaded from BPA automatically!`);
                }
            } catch (err) {
                console.error("Load rows from BPA failed:", err.message);
            }
        },

        // ── EXISTING: Trigger BPA (untouched) ──
        onTriggerProcessAutomation() {
            const oView            = this.getView();
            const sSystem          = oView.byId("systemSelect").getSelectedKey();
            const sCompanyCode     = oView.byId("companyCode").getValue();
            const sDeactFrom       = oView.byId("deactivationFrom").getValue();
            const sDeactTo         = oView.byId("deactivationTo").getValue();
            const sTransactionType = oView.byId("transactionType").getValue();
            const sDepreciation    = oView.byId("depreciationArea").getSelectedKey();
            const sSortVariant     = oView.byId("sortVariant").getValue();

            if (!sSystem || !sCompanyCode) {
                MessageBox.warning("Please fill in System and Company Code before triggering.");
                return;
            }

            const convertDate = (sDMY) => {
                if (!sDMY) return null;
                const parts = sDMY.split(".");
                if (parts.length !== 3) return null;
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            };

            oView.setBusy(true);

            fetch("/pillar2/triggerProcessAutomation", {
                method  : "POST",
                headers : { "Content-Type": "application/json", "Accept": "application/json" },
                body    : JSON.stringify({
                    system           : sSystem,
                    companyCode      : sCompanyCode,
                    deactivationFrom : convertDate(sDeactFrom),
                    deactivationTo   : convertDate(sDeactTo),
                    transactionType  : sTransactionType || null,
                    depreciationArea : sDepreciation    || null,
                    sortVariant      : sSortVariant     || null
                })
            })
            .then(res => {
                if (!res.ok) return res.text().then(text => { throw new Error(`HTTP ${res.status}: ${text}`); });
                return res.json();
            })
            .then(data => {
                oView.setBusy(false);
                const result = data.value || data;
                if (result.success) {
                    MessageBox.success(result.message || "BPA triggered successfully!");
                } else {
                    MessageBox.error(result.message || "BPA trigger failed.");
                }
            })
            .catch(err => {
                oView.setBusy(false);
                console.error("Full error:", err.message);
                MessageBox.error("Error: " + err.message);
            });
        },

        // ── EXISTING: Manual upload (untouched) ──
        onUploadPress() {
            document.getElementById("__pillarFileInput").click();
        },

        _onNativeFileChange(oEvent) {
            const oFile = oEvent.target.files[0];
            if (!oFile) return;
            oEvent.target.value = "";

            if (!oFile.name.endsWith(".xlsx") && !oFile.name.endsWith(".xls")) {
                MessageBox.error("Please upload a valid Excel file (.xlsx or .xls)");
                return;
            }

            const oReader = new FileReader();
            oReader.onload = (e) => {
                try {
                    const aRows = ExcelFormatter.parseAndFormat(e.target.result);
                    this.getView().getModel("tableModel").setProperty("/rows", aRows);
                    this.byId("uploadStatus").setVisible(true);
                    this.byId("uploadStatusText").setText(
                        `✔ "${oFile.name}" — ${aRows.length} rows formatted successfully.`
                    );
                    MessageToast.show(`${aRows.length} rows loaded and formatted!`);
                } catch (err) {
                    MessageBox.error("Failed to parse Excel: " + err.message);
                }
            };
            oReader.readAsArrayBuffer(oFile);
        },

        // ── EXISTING: Export (untouched) ──
        onExport() {
            const aRows = this.getView().getModel("tableModel").getProperty("/rows");
            if (!aRows || aRows.length === 0) {
                MessageToast.show("No data to export. Please upload a file first.");
                return;
            }
            ExcelFormatter.exportToExcel(aRows, "Pillar2_Formatted.xlsx");
            MessageToast.show("Export started!");
        },

        // ── EXISTING: Exit — stop polling ──
        onExit() {
            const el = document.getElementById("__pillarFileInput");
            if (el) el.remove();

            // ── NEW: Stop polling when view destroyed ──
            if (this._pollInterval) {
                clearInterval(this._pollInterval);
            }
        }
    });
});