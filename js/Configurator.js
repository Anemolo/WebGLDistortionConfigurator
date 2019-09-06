function encode(key, value) {
  return encodeURIComponent(key) + "=" + encodeURIComponent(value);
}

class DynamicFolder {
  constructor(name, controllerData, type, data) {
    this.name = name;
    this.mounted = false;
    this.gui = null;
    this.controllerData = controllerData;
    this.data = {};
    this.controllers = {};

    this.setData(type, data);
  }
  setData(type, givenData) {
    if (!type) {
      type = this.type;
    }
    let data = this.data[type];
    // If there is given data, don't use saved data.
    if (!data || givenData) {
      data = {};
      this.controllerData.get(type).forEach((item, key) => {
        data[key] = item.initialValue;
      });
    }
    if (givenData) {
      const dataKeys = Object.keys(data);
      dataKeys.forEach(key => {
        if (givenData[key]) data[key] = givenData[key];
      });
    }

    this.type = type;
    this.data[type] = data;
    if (this.mounted) this.render();
  }
  getData() {
    const data = this.data[this.type];
    return data;
  }
  renderItems(data, controllerData) {
    controllerData.forEach((item, key) => {
      const controller = this.gui.add.apply(
        this.gui,
        [data, key].concat(item.onAdd)
      );
      this.controllers[key] = controller;
      if (item.onController) {
        item.onController.forEach((value, key) => {
          controller[key](value);
        });
      }
    });
  }
  render() {
    if (!this.mounted) return;
    this.clean();
    const gui = this.gui;

    this.renderItems(this.data[this.type], this.controllerData.get(this.type));
    const nControllers = gui.__controllers.length;
    if (nControllers === 0) {
      gui.name = this.name + " (Empty)";
    } else {
      gui.name = this.name + " +" + nControllers;
    }
    this.gui.domElement.children[0].children[0].classList.add("shine");
    setTimeout(() => {
      this.gui.domElement.children[0].children[0].classList.remove("shine");
    }, 100);
  }
  clean() {
    if (!this.mounted) return;
    while (this.gui.__controllers.length > 0) {
      this.gui.remove(this.gui.__controllers[0]);
    }
  }
  mount(parentGUI) {
    if (this.mounted) return;
    const gui = parentGUI.addFolder(this.name);
    this.gui = gui;
    this.mounted = true;
    if (this.type != null) {
      this.render();
    }
  }
}
class Configurator {
  constructor(container, items, options) {
    this.gui = null;
    this.storageEffects = {
      idList: {
        drafts: this.getIds("drafts"),
        saved: this.getIds("saved")
      },
      retrieved: {}
    };
    this.forceDraft = false;
    this.onProgressChange = options.onProgressChange;
    delete options.onProgressChange;
    this.effectID = null;
    this.defaultOptions = Object.assign({}, options);
    options = this.getQueryOptionsOrLastValidDraft(options);
    this.effect = new GridToFullscreenEffect(container, items, options);
    this.initialized = false;
    this.options = {};
    // Generate a map of easings, with the easing object as a key
    // To use later as a lookup table
    let keys = Object.keys(window.com.greensock.easing);
    const easings = new Map([]);
    let easingLookup = new Map([]);
    keys.forEach(easeName => {
      let easeMeta = { name: easeName, types: [] };
      let ease = window.com.greensock.easing[easeName];
      let validTypes = ["easeIn", "easeOut", "easeInOut", "easeNone"];
      validTypes.forEach(type => {
        let easeType = ease[type];
        if (easeType) {
          easeMeta.types.push(type);
          easingLookup.set(easeType, { name: easeName, type });
        }
      });
      if (easeMeta.types.length > 0) {
        easings.set(easeName, easeMeta.types);
      }
    });

    this.easings = easings;
    this.easingLookup = easingLookup;

    this.getCustomOptions = this.getCustomOptions.bind(this);
    this.onItemFinishChangeReset = this.onItemFinishChangeReset.bind(this);
    this.onEffectIdGUIFinishChange = this.onEffectIdGUIFinishChange.bind(this);
    this.onSaveClick = this.onSaveClick.bind(this);
    this.guiControllers = {};
    // if (this.forceDraft)
    //   this.saveEffectToStorage(this.getCustomOptions(), false);
  }
  saveIds(type, ids) {
    const key = type + "Ids";

    localStorage.setItem(key, JSON.stringify(ids));
  }
  getIds(type) {
    const key = type + "Ids";
    let ids = JSON.parse(localStorage.getItem(key));
    if (!Array.isArray(ids)) {
      ids = [];
      localStorage.setItem(key, JSON.stringify(ids));
    }
    return ids;
  }
  updateDynamicItem(name, type, data) {
    const folder = this.guiControllers["dynamicFolder-" + name];
    if (!folder) return;

    folder.setData(type, data);
    this.effect.options[name].props = folder.getData();
  }
  createIDListOptions() {
    const withPrefix = prefix => (res, id, i) => {
      res[prefix + "-" + i] = id;
      return res;
    };
    const drafts = this.storageEffects.idList.drafts.reduce(
      withPrefix("drafts"),
      {}
    );

    const saved = this.storageEffects.idList.saved.reduce(
      withPrefix("saved"),
      {}
    );
    return Object.assign(
      {
        default: null
      },
      drafts,
      saved
    );
  }
  onEffectIdGUIFinishChange(id) {
    if (!this.forceDraft && (id == null || id == "null")) {
      this.effect.setOptions(this.defaultOptions);
    } else {
      const effect = this.getStorageEffect(id);
      this.effect.setOptions(effect);
    }

    const dynamicItems = ["activation", "transformation", "timing"];
    dynamicItems.forEach(name => {
      const dynamicTypeGUI = this.guiControllers["dynamicType-" + name];
      const dynamicFolder = this.guiControllers["dynamicFolder-" + name];
      dynamicTypeGUI.object = this.effect.options[name];
      dynamicTypeGUI.updateDisplay();
      dynamicFolder.setData(
        this.effect.options[name].type,
        this.effect.options[name].props
      );

      this.effect.options[name].props = dynamicFolder.getData();
    });
    const controllers = ["duration", "seed", "randomizeSeed"];
    controllers.forEach(name => {
      const controller = this.guiControllers[name];
      controller.updateDisplay();
    });
    const toGridEasingMeta = this.easingLookup.get(
      this.effect.options.easings.toGrid
    );
    const toFullEasingMeta = this.easingLookup.get(
      this.effect.options.easings.toFullscreen
    );
    this.toGridEase.name = toGridEasingMeta.name;
    this.toGridEase.type = toGridEasingMeta.type;
    this.toFullEase.name = toFullEasingMeta.name;
    this.toFullEase.type = toFullEasingMeta.type;
    [
      "toGridEaseName",
      "toGridEaseType",
      "toFullEaseName",
      "toFullEaseType"
    ].forEach(k => {
      const controller = this.guiControllers[k];
      controller.updateDisplay();
    });

    let toGridEaseTypes = this.easings.get(toGridEasingMeta.name);
    this.setControllerOptions(
      this.guiControllers["toGridEaseType"],
      toGridEaseTypes,
      true
    );
    let toFullEaseTypes = this.easings.get(toFullEasingMeta.name);
    this.setControllerOptions(
      this.guiControllers["toFullEaseType"],
      toFullEaseTypes,
      true
    );

    this.saveSettingsToURL();
  }
  onIDListUpdate() {
    this.effectSelectGUI = this.effectSelectGUI
      .options(this.createIDListOptions())
      .onFinishChange(this.onEffectIdGUIFinishChange);
    this.effectSelectGUI.updateDisplay();
  }
  saveEffectToStorage(data, hardSave) {
    if (!data) return;
    let initialID = this.effectID;
    let id = this.effectID;
    // If the effect it's the default save it as a draft or saved
    if (id == null || id == "null") {
      id = Math.random()
        .toString(36)
        .substring(7);
      if (hardSave) {
        id = "saved-" + id;
        this.storageEffects.idList.saved.push(id);
        this.saveIds("saved", this.storageEffects.idList.saved);
      } else {
        id = "draft-" + id;
        this.storageEffects.idList.drafts.unshift(id);
        if (this.storageEffects.idList.drafts.length > 5) {
          this.storageEffects.idList.drafts.pop();
        }
        this.saveIds("drafts", this.storageEffects.idList.drafts);
      }
      this.effectID = id;
    }
    // If this effect is a draft, and you are hard saving.
    // Delete the draft and generate new ID
    const draftIndex = this.storageEffects.idList.drafts.indexOf(id);
    if (hardSave && draftIndex > -1) {
      // Delete from local memory and storage
      delete this.storageEffects.retrieved[id];
      localStorage.setItem(id, null);
      // Remove from index list
      this.storageEffects.idList.drafts.splice(draftIndex, 1);
      this.saveIds("drafts", this.storageEffects.idList.drafts);

      // Create new savedId
      id =
        "saved-" +
        Math.random()
          .toString(36)
          .substring(7);

      this.storageEffects.idList.saved.push(id);
      this.saveIds("saved", this.storageEffects.idList.saved);

      this.effectID = id;
    }
    // Same to memory and storage
    this.storageEffects.retrieved[id] = data;
    localStorage.setItem(id, JSON.stringify(data));

    if (initialID !== this.effectID) {
      this.onIDListUpdate();
    }

    return [id, data];
  }
  getStorageEffect(id) {
    const effectInMemory = this.storageEffects.retrieved[id];
    if (effectInMemory == null) {
      return JSON.parse(localStorage.getItem(id));
    }
    return effectInMemory;
  }
  init() {
    this.effect.init();
    this.effect.forceInitializePlane(0);
    const gui = new dat.GUI();
    this.gui = gui;
    this.initialized = true;

    const effect = this.effect;
    const options = effect.options;

    this.effectSelectGUI = gui
      .add(this, "effectID", this.createIDListOptions())
      .onFinishChange(this.onEffectIdGUIFinishChange)
      .name("Preset");
    const progressGUI = gui
      .add(effect.uniforms.uProgress, "value", 0, 1, 0.025)
      .name("Progress")
      .onChange(progress => {
        if (effect.tween) {
          effect.tween.kill();
          effect.tween = null;
        }
        if (this.onProgressChange)
          this.onProgressChange({ index: effect.currentImageIndex, progress });
        if (progress > 0) {
          effect.itemsWrapper.style.zIndex = 0;
          effect.container.style.zIndex = 2;
        } else {
          effect.itemsWrapper.style.zIndex = 0;
          effect.container.style.zIndex = 0;
        }
        const isFullscreen = progress > 0.5;
        effect.isFullscreen = isFullscreen;
        effect.isAnimating = false;
        effect.render();
      });

    effect.options.onProgressTween = function(progress) {
      progressGUI.updateDisplay();
    };
    this.guiControllers["duration"] = gui
      .add(options, "duration", 0.5, 5, 0.25)
      .name("Duration")
      .onFinishChange(() => {
        this.onItemFinishChange();
      });

    // Easings

    const easingFolder = gui.addFolder("Easings");

    const easingsList = Array.from(this.easings.keys()).sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });

    const toGridEasingMeta = this.easingLookup.get(options.easings.toGrid);
    const toFullEasingMeta = this.easingLookup.get(
      options.easings.toFullscreen
    );

    this.toGridEase = {
      name: toGridEasingMeta.name,
      type: toGridEasingMeta.type
    };
    this.toFullEase = {
      name: toFullEasingMeta.name,
      type: toFullEasingMeta.type
    };

    this.guiControllers["toGridEaseName"] = easingFolder
      .add(this.toGridEase, "name", easingsList)
      .name("To-Grid easing")
      .onFinishChange(name => {
        let easeTypes = this.easings.get(name);
        this.setControllerOptions(
          this.guiControllers["toGridEaseType"],
          easeTypes
        );
        const easingFunction =
          window.com.greensock.easing[name][this.toGridEase.type];
        options.easings.toGrid = easingFunction;
        this.onItemFinishChange();
      });

    this.guiControllers["toGridEaseType"] = easingFolder
      .add(this.toGridEase, "type", this.easings.get(toGridEasingMeta.name))
      .name("To-Grid type")
      .onFinishChange(type => {
        const easingFunction =
          window.com.greensock.easing[this.toGridEase.name][type];
        options.easings.toGrid = easingFunction;
        this.onItemFinishChange();
      });

    this.guiControllers["toFullEaseName"] = easingFolder
      .add(this.toFullEase, "name", easingsList)
      .name("To-Full easing")
      .onFinishChange(name => {
        let easeTypes = this.easings.get(name);
        this.setControllerOptions(
          this.guiControllers["toFullEaseType"],
          easeTypes
        );

        const easingFunction =
          window.com.greensock.easing[name][this.toFullEase.type];
        options.easings.toFullscreen = easingFunction;
        this.onItemFinishChange();
      });

    this.guiControllers["toFullEaseType"] = easingFolder
      .add(this.toFullEase, "type", this.easings.get(toGridEasingMeta.name))
      .name("To-Full type")
      .onFinishChange(type => {
        const easingFunction =
          window.com.greensock.easing[this.toFullEase.name][type];
        options.easings.toFullscreen = easingFunction;
        this.onItemFinishChange();
      });

    // Timing
    // Fill all timings with empty options as default.
    const timingTypes = Object.keys(timings);
    const timingFolderItems = new Map(
      timingTypes
        .map(type => [type, new Map([])])
        .concat([
          [
            "sameEnd",
            new Map([
              [
                "latestStart",
                {
                  initialValue: 0.5,
                  onAdd: [0, 1, 0.05],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "reverse",
                {
                  initialValue: false,
                  onAdd: [],
                  onController: new Map([
                    ["name", "SyncStart"],
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "sections",
            new Map([
              [
                "sections",
                {
                  initialValue: 1,
                  onAdd: [1, 10, 1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ]
        ])
    );
    this.timingFolderItems = timingFolderItems;

    const timingFolder = this.createDynamicFolder(
      "timing",
      timingFolderItems,
      options.timing
    );
    timingFolder.mount(gui);

    const activationTypes = Object.keys(activations);
    const activationFolderItems = new Map(
      activationTypes
        .map(k => [k, new Map([])])
        .concat([
          [
            "snake",
            new Map([
              [
                "rows",
                {
                  initialValue: 4,
                  onAdd: [2, 7, 1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "squares",
            new Map([
              [
                "size",
                {
                  initialValue: 4,
                  onAdd: [2, 10, 1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "corners",
            new Map([
              [
                "topLeft",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "bottomLeft",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "topRight",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "bottomRight",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "radial",
            new Map([
              [
                "onMouse",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "x",
                {
                  initialValue: 0.5,
                  onAdd: [0, 1, 0.05],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "y",
                {
                  initialValue: 0.5,
                  onAdd: [0, 1, 0.05],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "side",
            new Map([
              [
                "top",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "left",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "bottom",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "right",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "sin",
            new Map([
              [
                "x",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "frequencyX",
                {
                  initialValue: 2,
                  onAdd: [1, 8, 0.2],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "piOffsetX",
                {
                  initialValue: 0.5,
                  onAdd: [0, 2, 0.25],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "y",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "frequencyY",
                {
                  initialValue: 2,
                  onAdd: [1, 8, 0.2],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "piOffsetY",
                {
                  initialValue: 0.5,
                  onAdd: [0, 2, 0.25],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "joinWith",
                {
                  initialValue: "multiplication",
                  onAdd: [["sum", "multiplication", "min", "max"]],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ]
        ])
    );
    this.activationFolderItems = activationFolderItems;

    const activationFolder = this.createDynamicFolder(
      "activation",
      activationFolderItems,
      options.activation,
      {
        onFinishTypeChange: (type, folder) => {
          const props = folder.getData();

          // If its empty set an option to true as default.
          // We don't want to set initial value so it's not skiped
          switch (type) {
            case "side":
              if (!props.top && !props.bottom && !props.left && !props.right) {
                folder.controllers["top"].setValue(true);
              }
              break;
            case "corners":
              if (
                !props.topLeft &&
                !props.bottomLeft &&
                !props.bottomLeft &&
                !props.topRight
              ) {
                folder.controllers["topLeft"].setValue(true);
              }
              break;
            case "sin":
              break;
          }
        }
      }
    );
    gui
      .add(options.debug, "activation")
      .name("Debug Activation")
      .onFinishChange(value => {
        effect.uniforms.uDebugActivation.value = value;
        effect.render();
        this.onItemFinishChange();
      });

    activationFolder.mount(gui);

    const transformTypes = Object.keys(transformations);
    const transformFolderItems = new Map(
      transformTypes
        .map(k => [k, new Map([])])
        .concat([
          [
            "rotation",
            new Map([
              [
                "unify",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "angle",
                {
                  initialValue: 180,
                  onAdd: [90, 720, 90],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "fluid",
            new Map([
              [
                "amplitude",
                {
                  initialValue: 0.3,
                  onAdd: [0, 2, 0.1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "frequency",
                {
                  initialValue: 1,
                  onAdd: [0.5, 4, 0.2],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "onMouse",
                {
                  initialValue: false,
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "x",
                {
                  initialValue: 0.5,
                  onAdd: [0, 1, 0.1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "y",
                {
                  initialValue: 0.5,
                  onAdd: [0, 1, 0.1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "progressLimit",
                {
                  initialValue: 0.5,
                  onAdd: [0, 1, 0.05],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "wavy",
            new Map([
              [
                "amplitude",
                {
                  initialValue: 0.4,
                  onAdd: [0, 3, 0.2],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "frequency",
                {
                  initialValue: 4,
                  onAdd: [1, 10, 0.2],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "simplex",
            new Map([
              [
                "amplitudeX",
                {
                  initialValue: 0.2,
                  onAdd: [0, 3, 0.2],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "amplitudeY",
                {
                  initialValue: 0.2,
                  onAdd: [0, 3, 0.2],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "frequencyX",
                {
                  initialValue: 0.3,
                  onAdd: [0, 4, 0.2],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "frequencyY",
                {
                  initialValue: 0.3,
                  onAdd: [0, 4, 0.2],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "progressLimit",
                {
                  initialValue: 0.5,
                  onAdd: [0, 1, 0.05],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ],
          [
            "flipX",
            new Map([
              [
                "beizerC0x",
                {
                  initialValue: 0.5,
                  onAdd: [-1, 2, 0.1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "beizerC0y",
                {
                  initialValue: 0.5,
                  onAdd: [-1, 2, 0.1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "beizerC1x",
                {
                  initialValue: 0.5,
                  onAdd: [-1, 2, 0.1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ],
              [
                "beizerC1y",
                {
                  initialValue: 0.5,
                  onAdd: [-1, 2, 0.1],
                  onController: new Map([
                    ["onFinishChange", this.onItemFinishChangeReset]
                  ])
                }
              ]
            ])
          ]
        ])
    );
    this.transformFolderItems = transformFolderItems;

    const transformationFolder = this.createDynamicFolder(
      "transformation",
      transformFolderItems,
      options.transformation
    );
    transformationFolder.mount(gui);

    this.guiControllers["seed"] = gui
      .add(options, "seed")
      .onFinishChange(seed => {
        effect.uniforms.uSeed.value = seed;
        this.onItemFinishChange();
      })
      .name("Seed");
    this.guiControllers["randomizeSeed"] = gui
      .add(options, "randomizeSeed", {
        nope: null,
        itemUnique: "itemUnique",
        inOutUnique: "inOutUnique",
        tweenUnique: "tweenUnique"
      })
      .onFinishChange(() => {
        this.onItemFinishChange();
      })
      .name("Randomize seed");
    gui.add(this, "onSaveClick").name("Save as preset");
    gui.add(this, "copyOptions").name("Copy to clipboard");

    if (this.forceDraft) {
      this.forceDraft = false;
      this.saveEffectToStorage(this.getCustomOptions(), false);
    }
    this.saveSettingsToURL();
  }
  onSaveClick() {
    const saved = this.saveEffectToStorage(this.getCustomOptions(), true);
  }
  createDynamicFolder(name, dynamicControllerData, item, options) {
    const folder = new DynamicFolder(
      name + " Options",
      dynamicControllerData,
      item.type,
      item.props
    );
    this.guiControllers["dynamicFolder-" + name] = folder;

    this.guiControllers["dynamicType-" + name] = this.gui
      .add(item, "type", Array.from(dynamicControllerData.keys()))
      .name(name)
      .onFinishChange(type => {
        this.updateDynamicItem(name, type, null);
        if (options && options.onFinishTypeChange) {
          options.onFinishTypeChange(type, folder);
        }
        this.onItemFinishChangeReset();
      });

    this.effect.options[name].props = folder.getData();

    return folder;
  }
  getQueryOptionsOrLastValidDraft(options) {
    // Check if there are URL settings
    let replacementSettings = this.getURLQuerySettings();

    if (
      replacementSettings != null &&
      !(
        Object.keys(replacementSettings).length === 1 &&
        replacementSettings.default
      )
    ) {
      let validOptions = [
        "activation",
        "timing",
        "transformation",

        "duration",
        "easings",
        "seed",
        "randomizeSeed"
      ];
      const givenOptions = {};
      validOptions.forEach(key => {
        // We have to delete it in case the given settings have anything there.
        // If there are saved settings, but a given option is not given. Default it.
        delete options[key];
        options[key] = replacementSettings[key];
      });

      this.forceDraft = true;
    }

    return options;
  }
  onItemFinishChangeReset(a) {
    this.effect.reset();
    this.onItemFinishChange();
  }
  onItemFinishChange() {
    this.saveEffectToStorage(this.getCustomOptions(), false);

    this.saveSettingsToURL();
  }
  settingsToURLQuery(settings) {
    if (this.effectID == null || this.effectID == "null") {
      return "default=true";
    }
    let params = [];
    const rawItems = ["duration", "seed", "randomizeSeed"];

    rawItems.forEach(key => {
      if (settings[key]) {
        let value = settings[key];
        if (typeof value === "number") {
          value = value.toFixed(2).replace(/^0|(\.[0-9](0)+)$|(0)+$/g, "");
        }
        params.push(encode(key, settings[key]));
      }
    });

    if (settings.easings) {
      if (settings.easings.toFullscreen) {
        params.push(encode("toFull", settings.easings.toFullscreen));
      }
      if (settings.easings.toGrid) {
        params.push(encode("toGrid", settings.easings.toGrid));
      }
    }
    const withTypesAndProps = ["timing", "transformation", "activation"];

    withTypesAndProps.forEach(key => {
      const item = settings[key];
      if (!item) return;
      let itemParams = [null];

      if (item.type) {
        // params.push(encode(key, item.type));
        itemParams[0] = encodeURIComponent(item.type);
      }
      if (item.props) {
        const keys = Object.keys(item.props);

        const propParams = keys.map(key => {
          let propValue = item.props[key];

          if (typeof propValue === "number") {
            propValue = propValue
              .toFixed(2)
              .replace(/^0|(\.[0-9](0)+)$|(0)+$/g, "");
          }
          return encodeURIComponent(key) + "," + encodeURIComponent(propValue);
        });
        itemParams = itemParams.concat(propParams);
      }
      params.push(encode(key, itemParams));
    });

    return params.join("&");
  }
  saveSettingsToURL() {
    const URLQuery = this.settingsToURLQuery(this.getCustomOptions());
    window.history.replaceState({}, document.title, "?" + URLQuery);
  }
  getURLQuerySettings() {
    const queries = window.location.href.split("?")[1];
    if (!queries) return;
    const queriesArray = queries.split("&").map(queryString => {
      queryString = decodeURIComponent(queryString);
      const equals = queryString.indexOf("=");
      return [
        queryString.substring(0, equals),
        queryString.substring(equals + 1)
      ];
    });
    const settings = queriesArray.reduce((res, param) => {
      const key = param[0];
      const value = param[1];

      switch (key) {
        case "timing":
        case "transformation":
        case "activation":
          const item = {};
          // [type, propKey1, propValue1, ... propKeyN, propValueN ]
          const valueArray = value.split(",");
          const type = valueArray[0];
          if (type.length > 0) {
            item.type = type;
          }
          const propsArray = valueArray.slice(1);
          if (propsArray.length > 0) {
            const props = {};

            for (let i = 0; i < propsArray.length; i += 2) {
              const propKey = propsArray[i];
              let propValue = propsArray[i + 1];
              // Convert to number if it's number
              if (propValue.length > 0 && !isNaN(propValue * 1))
                propValue = propValue * 1;
              else if (propValue === "true" || propValue === "false")
                propValue = propValue === "true";

              props[propKey] = propValue;
            }
            item.props = props;
          }

          res[key] = item;
          break;
        case "duration":
        case "seed":
          res[key] = Number(value);
          break;
        case "randomizeSeed":
          res[key] = value;
          break;
        case "toFull":
        case "toGrid":
          if (!res.easings) {
            res.easings = {};
          }
          if (key === "toFull") {
            res.easings.toFullscreen = value;
          } else {
            res.easings.toGrid = value;
          }
          break;
        case "default":
          res.default = value;
          break;
        default:
          break;
      }
      return res;
    }, {});
    if (Object.keys(settings).length === 0) {
      return null;
    }
    return settings;
  }
  omitDataWithDefaultValues(data) {
    const newData = {};

    const items = [
      ["timing", { type: "sameEnd", props: this.timingFolderItems }],
      ["activation", { type: "corners", props: this.activationFolderItems }],
      ["transformation", { type: "none", props: this.transformFolderItems }]
    ];
    // Copy values if they are not default ones
    items.forEach(arr => {
      const key = arr[0];
      const item = data[key];
      const newItem = {};

      if (item.type !== arr[1].type) {
        newItem.type = item.type;
      }
      if (item.props) {
        const defaultProps = arr[1].props.get(item.type);
        const newProps = {};
        defaultProps.forEach((propInfo, propKey) => {
          const prop = item.props[propKey];
          if (prop != null && propInfo.initialValue !== item.props[propKey]) {
            newProps[propKey] = item.props[propKey];
          }
        });

        if (Object.keys(newProps).length > 0) {
          newItem.props = newProps;
        }
      }
      if (Object.keys(newItem).length > 0) {
        newData[key] = newItem;
      }
    });
    return newData;
  }
  getCustomOptions() {
    // Everything breaks if you delete data from the original object.
    // Instead, do it as an additive process;
    const options = this.effect.options;
    // [key, value] to delete if match
    // ['timing', this.timingFolderItems]

    const newOptions = this.omitDataWithDefaultValues(options);

    const itemsDefault = [
      ["duration", 1],
      ["randomizeSeed", null],
      ["seed", 0]
    ];
    itemsDefault.forEach(item => {
      if (Array.isArray(item)) {
        if (options[item[0]] !== item[1]) {
          newOptions[item[0]] = options[item[0]];
        }
      }
    });
    newOptions.easings = {};

    if (
      this.toFullEase.name !== "Linear" &&
      this.toFullEase.name !== "Power0"
    ) {
      newOptions.easings.toFullscreen = `${this.toFullEase.name}.${this.toFullEase.type}`;
    }
    if (
      this.toGridEase.name !== "Linear" &&
      this.toGridEase.name !== "Power0"
    ) {
      newOptions.easings.toGrid = `${this.toGridEase.name}.${this.toGridEase.type}`;
    }
    if (Object.keys(newOptions.easings).length === 0) {
      delete newOptions.easings;
    }

    return newOptions;
  }
  copyOptions() {
    const customOptions = this.getCustomOptions();

    copyTextToClipboard(JSON.stringify(customOptions));
  }
  setControllerOptions(controller, options, force) {
    const select = controller.__select;
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
    if (options.length === 0) return;

    options.forEach(type => {
      const opt = document.createElement("option");
      opt.innerHTML = type;
      opt.setAttribute("value", type);
      select.appendChild(opt);
    });
    let value = controller.getValue();
    const valueIsAnOption = options.indexOf(value) > -1;
    if (force) {
      if (!valueIsAnOption) {
        controller.object[controller.property] = options[0];
      }
      controller.updateDisplay();
    } else {
      if (valueIsAnOption) {
        controller.setValue(value);
      } else {
        controller.setValue(options[0]);
      }
    }
  }
}

function fallbackCopyTextToClipboard(text) {
  var textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    var successful = document.execCommand("copy");
    var msg = successful ? "successful" : "unsuccessful";
    console.log("Fallback: Copying text command was " + msg);
  } catch (err) {
    console.error("Fallback: Oops, unable to copy", err);
  }

  document.body.removeChild(textArea);
}
function copyTextToClipboard(text) {
  if (!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
  }
  navigator.clipboard.writeText(text).then(
    function() {
      console.log("Async: Copying to clipboard was successful!");
    },
    function(err) {
      console.error("Async: Could not copy text: ", err);
    }
  );
}
