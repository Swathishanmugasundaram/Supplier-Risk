namespace supplier.portal;

using { cuid, managed } from '@sap/cds/common';

entity Suppliers : cuid, managed {
    supplierId          : String(20);
    supplierName        : String(100);
    riskScore           : Integer;
    riskStatus           : String(20);
    deliveryReliability : Integer;
    complianceScore     : Integer;
    totalLiabilities    : Decimal(15,2);
    country             : String(50);
}

entity PurchaseOrders : cuid, managed {
    poId            : String(20);
    supplier        : Association to Suppliers;
    itemCategory    : String(50);
    quantity        : Integer;
    orderValue      : Decimal(15,2);
    lifecycleStatus : String(20);
}

entity ChatHistory : cuid {
 sender : String(20);
 messageText : String(1000);
 timestamp : DateTime;
}