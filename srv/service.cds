using { com.bosch.pillar as db } from '../db/schema';

@path: '/pillar2'
service Pillar2Service {

    // ── Trigger BPA from UI ──
    @requires: 'Pillar2User'
    action triggerProcessAutomation(
        system           : String,
        companyCode      : String,
        deactivationFrom : Date,
        deactivationTo   : Date,
        transactionType  : String,
        depreciationArea : String,
        sortVariant      : String
    ) returns {
        success : Boolean;
        message : String;
    };

    // ── BPA posts raw Excel to this endpoint ──
    @requires: 'Pillar2Bot'
    action receiveReport(
        fileName    : String,
        fileContent : LargeString,
        companyCode : String,
        system      : String
    ) returns {
        success   : Boolean;
        message   : String;
        rowsSaved : Integer;
    };

    // ── Entities for UI read ──
    @requires: 'Pillar2User'
    entity AssetRows      as projection on db.AssetRetirementRow;

    @requires: 'authenticated-user'
    entity UploadSessions as projection on db.UploadSession;

}