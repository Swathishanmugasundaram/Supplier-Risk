
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (
    Controller,
    JSONModel,
    MessageBox,
    MessageToast
) {
    "use strict";

    return Controller.extend(
        "com.supplierrisk.supplierdashboard.controller.SupplierObjectPage",
        {

            // =========================================
            // INITIALIZE SUPPLIER MODEL
            // =========================================

            onInit: function () {

                this.getView().setModel(
                    new JSONModel({
                        ID: "",
                        supplierName: "",
                        supplierId: "",
                        riskScore: 0,
                        riskStatus: "Unknown",
                        riskLabel: "Risk assessment",
                        riskState: "None",

                        totalLiabilities: 0,
                        liabilitiesText: "Not available",

                        openPoSummary: "No open purchase order",
                        openPoItemSummary: "—",
                        openPoStatus: "No open PO",
                        openPoStatusState: "None",

                        notes: "",
                        purchaseOrders: [],

                        alternative: {
                            name: "Beta Logistics",
                            status: "SAFE · 15%",
                            riskScore: 15
                        },

                        ragAnswer:
                            "Upload a contract and connect the RAG backend to retrieve an answer.",
                            contractUploaded: false,
contractFileName: "",
ragQuestion: "Are urgent deliveries included in page 42?",
ragAnswer:
    "<strong>AI:</strong> Based on paragraph 3, urgent 24-hour delivery is allowed without additional premiums for orders under $20,000."
                    }),
                    "supplier"
                );

                const oRoute = this.getOwnerComponent()
                    .getRouter()
                    .getRoute("SupplierObjectPage");

                if (oRoute) {
                    oRoute.attachPatternMatched(
                        this._onRouteMatched,
                        this
                    );
                } else {
                    MessageBox.error(
                        "The SupplierObjectPage route was not found. " +
                        "Check the route name in manifest.json."
                    );
                }
            },


            // =========================================
            // ROUTE MATCHED
            // =========================================

            _onRouteMatched: async function (oEvent) {

                const supplierId =
                    oEvent.getParameter("arguments").key;

                if (!supplierId) {
                    MessageBox.error(
                        "No supplier ID was provided in the route."
                    );
                    return;
                }

                await this._loadSupplier(supplierId);
            },


            // =========================================
            // LOAD SELECTED SUPPLIER AND PURCHASE ORDERS
            // =========================================

            _loadSupplier: async function (supplierId) {

                try {

                    const [supplierResponse, poResponse] =
                        await Promise.all([

                            fetch(
                                "/odata/v4/supplier/Suppliers"
                            ),

                            fetch(
                                "/odata/v4/supplier/PurchaseOrders?$expand=supplier"
                            )

                        ]);

                    if (!supplierResponse.ok) {
                        throw new Error(
                            "Supplier request failed: HTTP " +
                            supplierResponse.status
                        );
                    }

                    if (!poResponse.ok) {
                        throw new Error(
                            "Purchase order request failed: HTTP " +
                            poResponse.status
                        );
                    }

                    const supplierResult =
                        await supplierResponse.json();

                    const poResult =
                        await poResponse.json();

                    const suppliers =
                        supplierResult.value || [];

                    const purchaseOrders =
                        poResult.value || [];


                    // Find supplier using the CAP entity ID.
                    // The route key must contain supplier.ID,
                    // not supplier.supplierId.

                    const supplier = suppliers.find(
                        function (item) {
                            return String(item.ID) ===
                                String(supplierId);
                        }
                    );

                    if (!supplier) {

                        MessageBox.error(
                            "The selected supplier was not found."
                        );

                        return;
                    }


                    // =====================================
                    // RISK STATUS
                    // =====================================

                    const riskScore =
                        Number(supplier.riskScore || 0);

                    const riskStatus =
                        supplier.riskStatus || "Unknown";

                    const riskState =
                        this._getRiskState(riskStatus);

                    let riskLabel;

                    if (
                        riskScore >= 80 ||
                        String(riskStatus).toUpperCase() === "CRITICAL"
                    ) {
                        riskLabel = "CRITICAL risk";
                    } else if (
                        riskScore >= 60 ||
                        ["HIGH", "MEDIUM", "MODERATE", "WARNING"]
                            .includes(String(riskStatus).toUpperCase())
                    ) {
                        riskLabel = "Elevated risk";
                    } else {
                        riskLabel = "Lower risk";
                    }


                    // =====================================
                    // FILTER PURCHASE ORDERS
                    // =====================================

                    const supplierOrders =
                        purchaseOrders
                            .filter(function (po) {

                                const expandedSupplierId =
                                    po.supplier &&
                                    typeof po.supplier === "object"
                                        ? po.supplier.ID
                                        : null;

                                const linkedSupplierId =
                                    expandedSupplierId ||
                                    po.supplier_ID;

                                return String(linkedSupplierId) ===
                                    String(supplier.ID);

                            })
                            .map(function (po) {

                                return {

                                    ID: po.ID,

                                    poId:
                                        po.poId || "—",

                                    itemCategory:
                                        po.itemCategory || "—",

                                    quantity:
                                        Number(po.quantity || 0),

                                    orderValue:
                                        Number(po.orderValue || 0),

                                    lifecycleStatus:
                                        po.lifecycleStatus || "Unknown",

                                    statusState:
                                        this._getStatusState(
                                            po.lifecycleStatus
                                        )

                                };

                            }.bind(this));


                    // =====================================
                    // FIND AN OPEN PURCHASE ORDER
                    // =====================================

                    const openOrder =
                        supplierOrders.find(function (po) {
                            return String(
                                po.lifecycleStatus || ""
                            ).toUpperCase() === "OPEN";
                        });

                    const openPoSummary = openOrder
                        ? openOrder.poId + " · " +
                            Number(
                                openOrder.orderValue
                            ).toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                                maximumFractionDigits: 0
                            })
                        : "No open purchase order";

                    const openPoItemSummary = openOrder
                        ? openOrder.quantity +
                            " × " + openOrder.itemCategory
                        : "—";

                    const openPoStatus = openOrder
                        ? openOrder.lifecycleStatus
                        : "No open PO";

                    const openPoStatusState = openOrder
                        ? this._getStatusState(
                            openOrder.lifecycleStatus
                        )
                        : "None";


                    // =====================================
                    // LIABILITIES
                    // =====================================

                    const totalLiabilities =
                        Number(supplier.totalLiabilities || 0);

                    const liabilitiesText =
                        totalLiabilities.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD"
                        });


                    // =====================================
                    // UPDATE SUPPLIER MODEL
                    // =====================================

                    const model =
                        this.getView().getModel("supplier");

                    model.setData({

                        ID: supplier.ID,

                        supplierName:
                            supplier.supplierName ||
                            "Unknown supplier",

                        supplierId:
                            supplier.supplierId ||
                            "Not available",

                        riskScore: riskScore,

                        riskStatus: riskStatus,

                        riskLabel: riskLabel,

                        riskState: riskState,

                        totalLiabilities: totalLiabilities,

                        liabilitiesText: liabilitiesText,

                        openPoSummary: openPoSummary,

                        openPoItemSummary: openPoItemSummary,

                        openPoStatus: openPoStatus,

                        openPoStatusState: openPoStatusState,

                        notes: supplier.notes || "",

                        purchaseOrders: supplierOrders,

                        alternative: {
                            name: "Beta Logistics",
                            status: "SAFE · 15%",
                            riskScore: 15
                        },

                        ragAnswer:
                            "Upload a contract and connect the RAG backend to retrieve an answer."

                    });

                    console.log(
                        "Loaded supplier:",
                        supplier.supplierName
                    );

                    console.log(
                        "Supplier ID:",
                        supplier.ID
                    );

                    console.log(
                        "Purchase orders:",
                        supplierOrders.length
                    );

                } catch (error) {

                    console.error(
                        "Supplier object page loading failed:",
                        error
                    );

                    MessageBox.error(
                        "Could not load supplier details. " +
                        "Check the CAP service and browser console."
                    );
                }
            },


            // =========================================
            // RISK COLOR MAPPING
            // =========================================

            _getRiskState: function (riskStatus) {

                switch (
                    String(riskStatus || "").toUpperCase()
                ) {

                    case "CRITICAL":
                    case "HIGH":
                        return "Error";

                    case "WARNING":
                    case "MEDIUM":
                    case "MODERATE":
                        return "Warning";

                    case "SAFE":
                    case "NORMAL":
                    case "LOW":
                        return "Success";

                    default:
                        return "None";
                }
            },


            // =========================================
            // PURCHASE ORDER STATUS COLOR
            // =========================================

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


            // =========================================
            // SAVE SUPPLIER NOTES
            // =========================================

            onSaveNotes: async function () {

                const model =
                    this.getView().getModel("supplier");

                const supplierId =
                    model.getProperty("/ID");

                const notes =
                    this.byId("supplierNotes").getValue();

                if (!supplierId) {

                    MessageBox.error(
                        "Supplier information has not loaded."
                    );

                    return;
                }

                try {

                    const response = await fetch(
                        "/odata/v4/supplier/Suppliers(" +
                        encodeURIComponent(supplierId) +
                        ")",
                        {
                            method: "PATCH",

                            headers: {
                                "Content-Type": "application/json"
                            },

                            body: JSON.stringify({
                                notes: notes
                            })
                        }
                    );

                    if (!response.ok) {

                        const errorText =
                            await response.text();

                        console.error(
                            "Save notes failed:",
                            errorText
                        );

                        throw new Error(
                            "The server rejected the notes update."
                        );
                    }

                    MessageToast.show(
                        "Supplier notes saved successfully."
                    );

                } catch (error) {

                    console.error(
                        "Notes save failed:",
                        error
                    );

                    MessageBox.error(
                        "Could not save notes. Check the CAP " +
                        "service response in the browser Network tab."
                    );
                }
            },
              

onContractFileChange: function (oEvent) {
    const oFile = oEvent.getParameter("files")?.[0];

    const oModel = this.getView().getModel("supplier");

    if (!oFile) {
        oModel.setProperty("/contractUploaded", false);
        oModel.setProperty("/contractFileName", "");
        return;
    }

    oModel.setProperty("/contractFileName", oFile.name);
    oModel.setProperty("/contractUploaded", true);
},

onRemoveContractFile: function () {
    const oUploader = this.byId("contractUploader");
    const oModel = this.getView().getModel("supplier");

    // Clear the selected file from the uploader.
    oUploader.clear();

    // Hide the uploaded-file pill and clear its filename.
    oModel.setProperty("/contractUploaded", false);
    oModel.setProperty("/contractFileName", "");

    MessageToast.show("Selected PDF removed.");
},


            // =========================================
            // RAG QUESTION PLACEHOLDER
            // =========================================

            // onAskContractQuestion: function () {

            //     const question =
            //         this.byId("contractQuestion")
            //             .getValue()
            //             .trim();

            //     if (!question) {

            //         MessageToast.show(
            //             "Enter a question about the contract first."
            //         );

            //         return;
            //     }

            //     MessageToast.show(
            //         "The RAG backend is not connected yet."
            //     );
            // },
onAskContractQuestion: function () {
    const oModel = this.getView().getModel("supplier");
    const sQuestion = this.byId("contractQuestion").getValue().trim();

    if (!sQuestion) {
        MessageToast.show("Enter a question about the contract first.");
        return;
    }

    if (!oModel.getProperty("/contractUploaded")) {
        MessageToast.show("Choose a PDF contract first.");
        return;
    }

    oModel.setProperty("/ragQuestion", sQuestion);

    oModel.setProperty(
        "/ragAnswer",
        "<strong>AI:</strong> The RAG backend is not connected yet. " +
        "This question has not been analyzed against the uploaded contract."
    );

    this.byId("contractQuestion").setValue("");
},

            // =========================================
            // NAVIGATION
            // =========================================

            onNavBack: function () {

                const router =
                    this.getOwnerComponent().getRouter();

                router.navTo(
                    "RouteSupplierRiskPortal",
                    {},
                    true
                );
            }

        }
    );
});
