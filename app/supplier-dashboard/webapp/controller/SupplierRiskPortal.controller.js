sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/format/NumberFormat",
    "sap/viz/ui5/data/FlattenedDataset",
    "sap/viz/ui5/controls/common/feeds/FeedItem"
], (Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    NumberFormat,
    FlattenedDataset,
    FeedItem) => {
    "use strict";

    return Controller.extend("com.supplierrisk.supplierdashboard.controller.SupplierRiskPortal", {
       onInit: function () {

                this.getView().setModel(
                    new JSONModel({
                        deliveryReliability: 85,
                        deliveryColor: "Good",

                        compliance: 60,
                        complianceColor: "Critical",

                        riskSpend: [],
                        purchaseOrders: []
                    }),
                    "dashboard"
                );

                this.getView().setModel(
                    new JSONModel({
                        messages: [{
                            sender: "AI Assistant",
                            messageText:
                                "Hello! Ask me about supplier risks or purchase orders."
                        }]
                    }),
                    "chat"
                );

                this._loadDashboardData();
            },


            // ==========================================
            // LOAD SUPPLIERS AND PURCHASE ORDERS
            // ==========================================

            _loadDashboardData: async function () {

                try {

                    const [supplierResponse, poResponse] =
                        await Promise.all([

                            fetch("/odata/v4/supplier/Suppliers"),

                            fetch(
                                "/odata/v4/supplier/PurchaseOrders" +
                                "?$expand=supplier"
                            )

                        ]);

                    if (
                        !supplierResponse.ok ||
                        !poResponse.ok
                    ) {
                        throw new Error(
                            "Could not load CAP OData data."
                        );
                    }

                    const supplierData =
                        await supplierResponse.json();

                    const poData =
                        await poResponse.json();

                    const suppliers =
                        supplierData.value || [];

                    const purchaseOrders =
                        poData.value || [];

                    const supplierMap = {};

                    suppliers.forEach(function (supplier) {

                        supplierMap[supplier.ID] = supplier;

                    });

                    // Build purchase order rows.
                    const rows = purchaseOrders.map(
                        function (po) {

                            // CAP association data can be expanded
                            // as an object or returned separately,
                            // depending on the service response.
                            const supplier =
                                po.supplier &&
                                typeof po.supplier === "object"
                                    ? po.supplier
                                    : supplierMap[po.supplier_ID];

                            const riskStatus =
                                supplier &&
                                supplier.riskStatus
                                    ? supplier.riskStatus
                                    : "Unknown";

                            return {

                                poNumber:
                                    po.poNumber || "—",

                                supplierName:
                                    supplier &&
                                    supplier.supplierName
                                        ? supplier.supplierName
                                        : "Unknown supplier",

                                orderValue:
                                    Number(po.orderValue || 0),

                                lifecycleStatus:
                                    po.lifecycleStatus || "Unknown",

                                riskStatus: riskStatus,

                                statusState:
                                    this._getStatusState(
                                        po.lifecycleStatus
                                    ),

                                riskState:
                                    this._getRiskState(riskStatus)

                            };

                        }.bind(this)
                    );

                    // Aggregate purchase order value by supplier.
                    const spendMap = {};

                    rows.forEach(function (row) {

                        const key = row.supplierName;

                        if (!spendMap[key]) {
                            spendMap[key] = {
                                supplierName: key,
                                orderValue: 0
                            };
                        }

                        spendMap[key].orderValue +=
                            row.orderValue;

                    });

                    const riskSpend =
                        Object.values(spendMap);

                    const dashboardModel =
                        this.getView().getModel("dashboard");

                    dashboardModel.setProperty(
                        "/purchaseOrders",
                        rows
                    );

                    dashboardModel.setProperty(
                        "/riskSpend",
                        riskSpend
                    );

                    this._updateChart();

                    console.log(
                        "Supplier records:",
                        suppliers.length
                    );

                    console.log(
                        "Purchase order records:",
                        rows.length
                    );

                } catch (error) {

                    console.error(
                        "Dashboard loading failed:",
                        error
                    );

                    MessageBox.error(
                        "The dashboard could not load its CAP data. " +
                        "Check that the CAP server is running and " +
                        "that both OData endpoints are available."
                    );

                }

            },


            // ==========================================
            // CHART CONFIGURATION
            // ==========================================

            _updateChart: function () {

                const chart =
                    this.byId("riskSpendChart");

                const dataset =
                    chart.getDataset();

                if (dataset) {
                    dataset.destroy();
                }

                chart.setDataset(
                    new FlattenedDataset({

                        dimensions: [{
                            name: "Supplier",
                            value: "{dashboard>supplierName}"
                        }],

                        measures: [{
                            name: "Purchase Order Value",
                            value: "{dashboard>orderValue}"
                        }],

                        data: {
                            path: "dashboard>/riskSpend"
                        }

                    })
                );

                chart.setVizProperties({

                    title: {
                        visible: true,
                        text: "Purchase Order Value by Supplier"
                    },

                    legend: {
                        visible: false
                    },

                    plotArea: {
                        dataLabel: {
                            visible: true
                        }
                    },

                    valueAxis: {
                        title: {
                            visible: true,
                            text: "Order Value (USD)"
                        }
                    },

                    categoryAxis: {
                        title: {
                            visible: true,
                            text: "Supplier"
                        }
                    }

                });

            },


            // ==========================================
            // STATUS COLOR MAPPING
            // ==========================================

            _getStatusState: function (status) {

                switch (
                    String(status || "").toUpperCase()
                ) {

                    case "DELIVERED":
                    case "COMPLETED":
                        return "Success";

                    case "OPEN":
                    case "IN_PROGRESS":
                        return "Warning";

                    case "CANCELLED":
                    case "REJECTED":
                        return "Error";

                    default:
                        return "None";
                }

            },


            _getRiskState: function (riskStatus) {

                switch (
                    String(riskStatus || "").toUpperCase()
                ) {

                    case "CRITICAL":
                    case "HIGH":
                        return "Error";

                    case "MEDIUM":
                    case "MODERATE":
                        return "Warning";

                    case "NORMAL":
                    case "LOW":
                    case "SAFE":
                        return "Success";

                    default:
                        return "None";
                }

            },


            // ==========================================
            // CHAT DIALOG
            // ==========================================

            onOpenChat: function () {

                this.byId("globalChatDialog").open();

            },


            onCloseChat: function () {

                this.byId("globalChatDialog").close();

            },


            onSendChat: async function () {

                const input = this.byId("chatInput");

                const question =
                    input.getValue().trim();

                if (!question) {
                    return;
                }

                const chatModel =
                    this.getView().getModel("chat");

                const messages =
                    chatModel.getProperty("/messages");

                messages.push({

                    sender: "You",
                    messageText: question

                });

                chatModel.setProperty(
                    "/messages",
                    messages
                );

                input.setValue("");

                try {

                    /*
                     * Replace /ai/chat with your actual
                     * Python AI backend endpoint when it
                     * has been implemented and configured.
                     */

                    const response = await fetch(
                        "/ai/chat",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                message: question
                            })

                        }
                    );

                    if (!response.ok) {
                        throw new Error(
                            "AI service returned an error."
                        );
                    }

                    const result =
                        await response.json();

                    messages.push({

                        sender: "AI Assistant",

                        messageText:
                            result.answer ||
                            result.response ||
                            "The AI service returned no answer."

                    });

                } catch (error) {

                    console.error(
                        "Chat request failed:",
                        error
                    );

                    messages.push({

                        sender: "AI Assistant",

                        messageText:
                            "The AI backend is not connected yet. " +
                            "Please configure the /ai/chat endpoint."

                    });

                }

                chatModel.setProperty(
                    "/messages",
                    messages
                );

            }
    });
});