namespace com.bosch.pillar;

using { cuid, managed } from '@sap/cds/common';

// ── Main selections/filter parameters ──
entity ProcessAutomation : cuid, managed {
  system           : String(50);
  companyCode      : String(20);
  deactivationFrom : Date;
  deactivationTo   : Date;
  transactionType  : String(50);
  depreciationArea : String(10);
  sortVariant      : String(50);
  status           : String(20) default 'PENDING';
  triggeredAt      : Timestamp;
  triggeredBy      : String(100);
}

// ── Each uploaded Excel file metadata ──
entity UploadSession : cuid, managed {
  fileName         : String(255);
  originalRows     : Integer;
  formattedRows    : Integer;
  status           : String(20) default 'UPLOADED';
  processRef       : Association to ProcessAutomation;
  rows             : Composition of many AssetRetirementRow on rows.session = $self;
}

// ── Each row from the uploaded Excel ──
entity AssetRetirementRow : cuid {
  session          : Association to UploadSession;

  // ── Columns matching your table ──
  Asset            : String(50);
  SNo              : String(20);
  AssetClass       : String(20);
  CapitalizedOn    : String(20);   // stored as DD.MM.YYYY string after formatting
  DeactDate        : String(20);   // stored as DD.MM.YYYY string after formatting
  Use              : String(20);
  AssetDescription : String(255);
  BSAcctAPC        : String(50);
  Retirement       : Decimal(15,2);
  DeprRetired      : Decimal(15,2);
  RetBookValue     : Decimal(15,2);
  RetRevenue       : Decimal(15,2);
  Loss             : Decimal(15,2);
  Gain             : Decimal(15,2);
  Crcy             : String(5);
  TType            : String(10);
  Document         : String(50);
  Text             : String(255);
  Reference        : String(100);
  InvoiceID        : String(100);

  // ── Formatting audit ──
  wasReformatted   : Boolean default false;
  originalRaw      : LargeString;   // stores original raw JSON string before formatting
}