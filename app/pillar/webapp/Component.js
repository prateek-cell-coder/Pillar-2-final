sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/bosch/pillar/pillar/model/models"
], (UIComponent, models) => {
    "use strict";
    return UIComponent.extend("com.bosch.pillar.pillar.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },
        init() {
            UIComponent.prototype.init.apply(this, arguments);
            this.setModel(models.createDeviceModel(), "device");
            this.getRouter().initialize();
        }
    });
});