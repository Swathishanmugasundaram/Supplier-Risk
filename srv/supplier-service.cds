using { supplier.portal as db } from '../db/schema';

service SupplierService {

    @readonly
    entity Suppliers as projection on db.Suppliers;

    @readonly
    entity PurchaseOrders as projection on db.PurchaseOrders;

     @readonly
    entity ChatHistory as projection on db.ChatHistory;

}