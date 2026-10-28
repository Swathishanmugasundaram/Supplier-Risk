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
                        messageText: "Hello! Ask me about supplier risks or purchase orders."
                    }]
                }),
                "chat"
            );

            this._loadDashboardData();
        },

        _loadDashboardData: async function () {
            try {
                const [supplierResponse, poResponse] = await Promise.all([
                    fetch("/odata/v4/supplier/Suppliers"),
                    fetch("/odata/v4/supplier/PurchaseOrders?$expand=supplier")
                ]);

                if (!supplierResponse.ok || !poResponse.ok) {
                    throw new Error("Could not load CAP OData data.");
                }

                const supplierData = await supplierResponse.json();
                const poData = await poResponse.json();

                const suppliers = supplierData.value || [];
                const purchaseOrders = poData.value || [];

                const supplierMap = {};
                suppliers.forEach(supplier => {
                    supplierMap[supplier.ID] = supplier;
                });

                const rows = purchaseOrders.map(po => {
                    const supplier = po.supplier && typeof po.supplier === "object"
                        ? po.supplier
                        : supplierMap[po.supplier_ID];

                    const riskStatus = supplier && supplier.riskStatus ? supplier.riskStatus : "Unknown";

                    return {
                        supplierID: supplier ? supplier.ID : po.supplier_ID,
                        poId: po.poId || "—",
                        supplierName: supplier && supplier.supplierName ? supplier.supplierName : "Unknown supplier",
                        orderValue: Number(po.orderValue || 0),
                        lifecycleStatus: po.lifecycleStatus || "Unknown",
                        riskStatus: riskStatus,
                        statusState: this._getStatusState(po.lifecycleStatus),
                        riskState: this._getRiskState(riskStatus)
                    };
                });

                const spendMap = {};
                rows.forEach(row => {
                    const key = row.supplierName;
                    if (!spendMap[key]) {
                        spendMap[key] = {
                            supplierName: key,
                            riskStatus: row.riskStatus,
                            orderValue: 0
                        };
                    }
                    spendMap[key].orderValue += row.orderValue;
                });

                const riskSpend = Object.values(spendMap);

                const dashboardModel = this.getView().getModel("dashboard");
                dashboardModel.setProperty("/purchaseOrders", rows);
                dashboardModel.setProperty("/riskSpend", riskSpend);

                this._updateChart();
            } catch (error) {
                console.error("Dashboard loading failed:", error);
                MessageBox.error("The dashboard could not load its CAP data.");
            }
        },

        _updateChart: function () {
            const chart = this.byId("riskSpendChart");

            chart.setVizProperties({
                title: {
                    visible: true,
                    text: "Risk Spend by Supplier"
                },
                legend: {
                    visible: true,
                    position: "right"
                },
                plotArea: {
                    dataLabel: {
                        visible: true,
                        formatString: "#,##0"
                    },
                    colorPalette: [
                        "#D94343",
                        "#4CAF50",
                        "#E87500",
                        "#777777"
                    ]
                },
                valueAxis: {
                    title: {
                        visible: true,
                        text: "Order Value (USD)"
                    },
                    label: {
                        formatString: "#,##0"
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

        _getStatusState: function (status) {
            switch (String(status || "").toUpperCase()) {
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
            switch (String(riskStatus || "").toUpperCase()) {
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

        onOpenSupplier: function (oEvent) {
            const context = oEvent.getSource().getBindingContext("dashboard");
            if (!context) return;
            const supplierId = context.getProperty("supplierID");
            if (!supplierId) return;

            this.getOwnerComponent().getRouter().navTo("SupplierObjectPage", { key: supplierId });
        },

        onOpenChat: function () {
            this.byId("globalChatDialog").open();
        },

        onCloseChat: function () {
            this.byId("globalChatDialog").close();
        },

        onSendChat: async function () {
            const input = this.byId("chatInput");
            const question = input.getValue().trim();
            if (!question) return;

            const chatModel = this.getView().getModel("chat");
            const messages = chatModel.getProperty("/messages");
            messages.push({ sender: "You", messageText: question });
            chatModel.setProperty("/messages", messages);
            input.setValue("");

            try {
                const response = await fetch("/ai/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: question })
                });

                if (!response.ok) throw new Error("AI service returned an error.");
                const result = await response.json();

                messages.push({
                    sender: "AI Assistant",
                    messageText: result.answer || result.response || "No answer returned."
                });
            } catch (error) {
                messages.push({
                    sender: "AI Assistant",
                    messageText: "The AI backend is not connected yet."
                });
            }
            chatModel.setProperty("/messages", messages);
        }
    });
});