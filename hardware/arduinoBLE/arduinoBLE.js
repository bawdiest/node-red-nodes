/**
 * Copyright 2013,2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    "use strict";
    var BLEdevice = require('noble');
    
    // The main node definition - most things happen in here
    function NobleScan(n) {
        // Create a RED node
        RED.nodes.createNode(this,n);

        // Store local copies of the node configuration (as defined in the .html)
        this.duplicates = n.duplicates;
        this.uuids = [];
        if (n.uuids != undefined && n.uuids !== "") {
            this.uuids = n.uuids.split(',');    //obtain array of uuids
        }

        var node = this;
        var machineId = os.hostname();
        var scanning = false;

        noble.on('discover', function(peripheral) {
            var msg = { payload:{peripheralUuid:peripheral.uuid, localName: peripheral.advertisement.localName} };
            msg.peripheralUuid = peripheral.uuid;
            msg.localName = peripheral.advertisement.localName;
            msg.detectedAt = new Date().getTime();
            msg.detectedBy = machineId;
            msg.advertisement = peripheral.advertisement;
            msg.rssi = peripheral.rssi;

            // Check the BLE follows iBeacon spec
            if (peripheral.manufacturerData) {
                // http://www.theregister.co.uk/2013/11/29/feature_diy_apple_ibeacons/
                if (peripheral.manufacturerData.length >= 25) {
                    var proxUuid = peripheral.manufacturerData.slice(4, 20).toString('hex');
                    var major = peripheral.manufacturerData.readUInt16BE(20);
                    var minor = peripheral.manufacturerData.readUInt16BE(22);
                    var measuredPower = peripheral.manufacturerData.readInt8(24);

                    var accuracy = Math.pow(12.0, 1.5 * ((rssi / measuredPower) - 1));
                    var proximity = null;

                    if (accuracy < 0) {
                        proximity = 'unknown';
                    } else if (accuracy < 0.5) {
                        proximity = 'immediate';
                    } else if (accuracy < 4.0) {
                        proximity = 'near';
                    } else {
                        proximity = 'far';
                    }

                    msg.manufacturerUuid = proxUuid;
                    msg.major = major;
                    msg.minor = minor;
                    msg.measuredPower = measuredPower;
                    msg.accuracy = accuracy;
                    msg.proximity = proximity;
                }
            }

            // Generate output event
            node.send(msg);
        });

        // Take care of starting the scan and sending the status message
        function startScan(stateChange, error) {
            if (!node.scanning) {
                // send status message
                var msg = {
                    statusUpdate: true,
                    error: error,
                    stateChange: stateChange,
                    state: noble.state
                };
                node.send(msg);
                // start the scan
                noble.startScanning(node.uuids, node.duplicates, function() {
                    node.log("Scanning for BLEs started. UUIDs: " + node.uuids + " - Duplicates allowed: " + node.duplicates);
                    node.status({fill:"green",shape:"dot",text:"started"});
                    node.scanning = true;
                });
            }
        }

        // Take care of stopping the scan and sending the status message
        function stopScan(stateChange, error) {
            if (node.scanning) {
                // send status message
                var msg = {
                    statusUpdate: true,
                    error: error,
                    stateChange: stateChange,
                    state: noble.state
                };
                node.send(msg);
                // stop the scan
                noble.stopScanning(function() {
                    node.log('BLE scanning stopped.');
                    node.status({fill:"red",shape:"ring",text:"stopped"});
                    node.scanning = false;
                });
                if (error) {
                    node.warn('BLE scanning stopped due to change in adapter state.');
                }
            }
        }

        // deal with state changes
        noble.on('stateChange', function(state) {
            if (state === 'poweredOn') {
                startScan(true, false);
            } else {
                if (node.scanning) {
                    stopScan(true, true);
                }
            }
        });

        // start initially
        if (noble.state === 'poweredOn') {
            startScan(false, false);
        } else {
            // send status message
            var msg = {
                statusUpdate: true,
                error: true,
                stateChange: false,
                state: noble.state
            };

            // TODO: Catch a global event instead eventually
            setTimeout(function(){
                node.send(msg);
            }, 3000);

            node.warn('Unable to start BLE scan. Adapter state: ' + noble.state);
        }

        // control scanning
        node.on('input', function (msg) {
            if (msg.hasOwnProperty("payload") && typeof msg.payload == "object" && msg.payload.hasOwnProperty("scan")) {
                if (msg.payload.scan === true) {
                    startScan(false, false);
                    return;
                } else if (msg.payload.scan === false) {
                    stopScan(false, false);
                    return;
                }
            }
            node.warn("Incorrect input, ignoring. See the documentation in the info tab. ");
        });

    
        node.on("close", function() {
            // Called when the node is shutdown - eg on redeploy.
            // Allows ports to be closed, connections dropped etc.
            // eg: this.client.disconnect();
            stopScan(false, false);
            // remove listeners since they get added again on deploy
            noble.removeAllListeners();
        });

    }
    
    // Register the node by name. This must be called before overriding any of the
    // Node functions.
    RED.nodes.registerType("scan ble",NobleScan);
    
    

    // The Board Definition - this opens (and closes) the connection
    function arduinoBLENode(n) {
        RED.nodes.createNode(this,n);
        this.device = n.device || null;
        this.repeat = n.repeat||25;
        var node = this;
        node.board = new BLEdevice();
        // TODO: nls
            if (typeof node.stag === "undefined") {
                node.log(RED._("arduino.status.connectfirst"));
                node.board.startScanning();
            }
            
            node.board.on('discover', function(peripheral) {
  if (peripheral.advertisement.localName === 'PIZDA') {
    noble.stopScanning();
   }
       }
       
        node.on('close', function(done) {
        });
    }
    RED.nodes.registerType("arduino-BLE-board",ArduinoBLENode);


    // The Input Node
    function DuinoNodeIn(n) {
        RED.nodes.createNode(this,n);
        this.buttonState = -1;
        this.pin = n.pin;
        this.state = n.state;
        this.arduino = n.arduino;
        this.serverConfig = RED.nodes.getNode(this.arduino);
        
        node.send("OK");
        
        }
        else {
            this.warn(RED._("arduino.errors.portnotconf"));
        }
    }
    RED.nodes.registerType("arduino in",DuinoNodeIn);


    // The Output Node
    function DuinoNodeOut(n) {
        RED.nodes.createNode(this,n);
        this.buttonState = -1;
        this.pin = n.pin;
        this.state = n.state;
        this.arduino = n.arduino;
        this.serverConfig = RED.nodes.getNode(this.arduino);
        if (typeof this.serverConfig === "object") {
            this.board = this.serverConfig.board;
            var node = this;
            node.status({fill:"red",shape:"ring",text:"node-red:common.status.connecting"});

            node.board.on('discover', function() {
                node.status({fill:"green",shape:"dot",text:"node-red:common.status.connected"});
                //console.log("o",node.state,node.pin);

    }
    RED.nodes.registerType("arduino out",DuinoNodeOut);

}
