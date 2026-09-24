cc.Class({
    extends: cc.Component,

    properties: {
        yesButton: {
            default: null,
            type: cc.Button
        },
        noButton: {
            default: null,
            type: cc.Button
        }
    },

    onLoad: function () {
        // Initialize PopUp as hidden
        this.node.active = false;
        cc.log('PopUpVillage initialized, active:', this.node.active);

        // Ensure buttons are assigned
        if (this.yesButton && this.yesButton.node) {
            this.yesButton.node.on('click', this.onYesButtonClick, this);
            cc.log('YES Button assigned successfully to node:', this.yesButton.node.name);
        } else {
            cc.warn('YES Button is not assigned or invalid in PopUpVillage node.');
        }
        if (this.noButton && this.noButton.node) {
            this.noButton.node.on('click', this.onNoButtonClick, this);
            cc.log('NO Button assigned successfully to node:', this.noButton.node.name);
        } else {
            cc.warn('NO Button is not assigned or invalid in PopUpVillage node.');
        }
    },

    onYesButtonClick: function () {
        cc.log('YES Button clicked. Transitioning to Home scene.');
        const manager = cc.director.getScene().getComponentInChildren('GameManager');
        if (manager) manager.changeScene('Home');
    },

    onNoButtonClick: function () {
        cc.log('NO Button clicked. Attempting to hide PopUpVillage.');
        if (this.node && this.node.isValid) {
            this.node.active = false;
            cc.log('PopUpVillage active state set to:', this.node.active);
        } else {
            cc.warn('PopUpVillage node is invalid or destroyed.');
        }
    },

    removeEventListeners: function () {
        if (this.yesButton && this.yesButton.node && this.yesButton.node.isValid) {
            this.yesButton.node.off('click', this.onYesButtonClick, this);
            cc.log('Removed YES Button event listener from:', this.yesButton.node.name);
        }
        if (this.noButton && this.noButton.node && this.noButton.node.isValid) {
            this.noButton.node.off('click', this.onNoButtonClick, this);
            cc.log('Removed NO Button event listener from:', this.noButton.node.name);
        }
    },

    onDestroy: function () {
        this.removeEventListeners();
        cc.log('PopUpVillage node destroyed. Cleaned up listeners.');
    }
});
