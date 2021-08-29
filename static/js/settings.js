import { CacheManager } from "/static/js/cache_manager.js";
export function microphone_visualize(stream) {
  let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let analyser = audioCtx.createAnalyser();
  let source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);
  analyser.fftSize = 2048;
  var bufferLength = analyser.frequencyBinCount;
  var dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);
  analyser.fftSize = 256;
  var bufferLength = analyser.frequencyBinCount;
  var dataArray = new Uint8Array(bufferLength);

  function draw() {
    analyser.getByteFrequencyData(dataArray);
    let barHeight;
    let avg = 0;

    for (var i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i];
      avg += barHeight;
    }

    avg = Math.floor(avg / bufferLength);
    let span = document.getElementById("audio-line");
    span.style.background = 'rgb(70,' + (avg + 150) + ',70)';
    span.style.width = Math.floor(avg / 2.55) + "%";
    requestAnimationFrame(draw);
  }

  draw();
}

class SettingsComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      "devices": {
        "videoinput": [],
        "audioinput": []
      },
      "selected-device": {
        "video": null,
        "audio": null
      }
    };
    this.video_select = this.video_select.bind(this);
    this.audio_select = this.audio_select.bind(this);
    this.getDevices = this.getDevices.bind(this);
    this.getDevices();
    const self = this;
    document.addEventListener("settings-media-device", function (e) {
      let data = e.detail;

      if (data["tracks"] == undefined) {
        return;
      }

      if (data["tracks"]["video"] != undefined) {
        let settings_video = document.querySelector("#settings-video");

        if (settings_video.srcObject != undefined) {
          let track = settings_video.srcObject.getVideoTracks()[0];
          track.enabled = false;
          track.stop();
        }

        let video_track = data["tracks"]["video"];
        video_track = video_track.clone();
        video_track.enabled = true;
        let video_stream = new MediaStream([video_track]);
        settings_video.srcObject = video_stream;
      }

      if (data["tracks"]["audio"] != undefined) {
        let audio_track = data["tracks"]["audio"];
        audio_track = audio_track.clone();
        audio_track.enabled = true;
        let audio_stream = new MediaStream([audio_track]);
        microphone_visualize(audio_stream);
      }
    });
  }

  async getDevices() {
    const self = this;
    let cache_manager = new CacheManager();

    try {
      let data = await cache_manager.get("selected-device");
      data = JSON.parse(data);
      this.video = data["video"];
      this.audio = data["audio"];
    } catch {}

    let video_promise = new Promise((resolve, reject) => {
      navigator.mediaDevices.getUserMedia({
        video: true
      }).then(function (stream) {
        resolve(true);
      }).catch(function (err) {
        resolve(false);
      });
    });
    let audio_promise = new Promise((resolve, reject) => {
      navigator.mediaDevices.getUserMedia({
        audio: true
      }).then(function (stream) {
        resolve(true);
      }).catch(function (err) {
        resolve(false);
      });
    });
    let video_res = await video_promise;
    let audio_res = await audio_promise;
    let media_device_data = {
      "video": false,
      "audio": false
    };

    if (video_res == true) {
      media_device_data["video"] = true;
    } else {
      media_device_data["video"] = false;
    }

    if (audio_res == true) {
      media_device_data["audio"] = true;
    } else {
      media_device_data["audio"] = false;
    }

    if (media_device_data["audio"] == false && media_device_data["video"] == false) {
      document.dispatchEvent(new CustomEvent("media-device", {
        detail: media_device_data
      }));
      return;
    }

    navigator.mediaDevices.enumerateDevices().then(async function (devices) {
      let devices_state = self.state;

      for (let i = 0; i < devices.length; i++) {
        let kind = devices[i]["kind"];

        if (devices_state["devices"][kind] != undefined) {
          devices_state["devices"][kind].push({
            "id": devices[i]["deviceId"],
            "label": devices[i]["label"]
          });
        }
      } // save this to cache and get choosen devices from cache


      devices_state["selected-device"] = {};
      let cache_manager = new CacheManager();
      let data;

      try {
        data = JSON.parse(await cache_manager.get("selected-device"));
      } catch {
        data = undefined;
      }

      let preprocess = true;

      if (data != undefined) {
        preprocess = false;

        for (let kind in data) {
          let device = {
            "id": undefined
          };

          for (let i = 0; i < devices_state["devices"][kind + "input"].length; i++) {
            let item = devices_state["devices"][kind + "input"][i];

            if (item.label == data[kind]) {
              device.id = item.id;
            }
          }

          if (device.id == undefined) {
            preprocess = true;
          }

          devices_state["selected-device"][kind] = device.id;
        }
      }

      if (preprocess) {
        let cache_manager = new CacheManager();
        let init_cache_data = {};

        for (let key in devices_state["devices"]) {
          try {
            devices_state["selected-device"][key.replace("input", "")] = devices_state["devices"][key][0]["id"];
            init_cache_data[key.replace("input", "")] = devices_state["devices"][key][0]["label"];

            if (devices_state["selected-device"][key.replace("input", "")] == "") {
              devices_state["selected-device"][key.replace("input", "")] = undefined;
            }
          } catch {
            devices_state["selected-device"][key.replace("input", "")] = undefined;
          }
        }

        cache_manager.put("selected-device", JSON.stringify(init_cache_data));
      }

      console.log(devices_state); // devices_state["selected-device"] = {
      //   "video": devices_state["videoinput"][0]["id"],
      //   "audio": devices_state["audioinput"][0]["id"],
      // };

      document.dispatchEvent(new CustomEvent("media-device", {
        detail: devices_state["selected-device"]
      }));
      self.setState(devices_state);
    }).catch(function (err) {
      console.log(err);
    });
  }

  async device_select(e, obj_type) {
    let select = e.target;
    let device_id = e.target.value;
    let device_label = select.querySelector("option[value='{}']".replace("{}", device_id)).innerText;
    let cache_manager = new CacheManager();
    let data;

    try {
      data = await cache_manager.get("selected-device");
      data = JSON.parse(data);
    } catch {
      data = {};
    }

    data[obj_type] = device_label;
    cache_manager.put("selected-device", JSON.stringify(data));
    let label = e.target.querySelector("option[value='{}']".replace("{}", device_id));
    label = label.innerText;
    let selected_device = this.state["selected-device"];
    selected_device[obj_type] = device_id;
    this.setState({
      "selected-device": selected_device
    });
    document.dispatchEvent(new CustomEvent("media-device", {
      detail: selected_device
    }));
  }

  video_select(e) {
    this.device_select(e, "video");
  }

  audio_select(e) {
    this.device_select(e, "audio");
  }

  close_settings() {
    document.querySelector(".settings-modal").setAttribute("style", "display: none;");
  }

  render() {
    let video_label = false;
    let audio_label = false;

    if (this.video != undefined) {
      video_label = this.video;
    }

    if (this.audio != undefined) {
      audio_label = this.audio;
    }

    let video_devices = /*#__PURE__*/React.createElement("select", {
      onChange: this.video_select
    }, this.state["devices"]["videoinput"].map(function (item) {
      let obj;

      if (item.label == video_label) {
        obj = /*#__PURE__*/React.createElement("option", {
          selected: "selected",
          value: item.id
        }, item.label);
      } else {
        obj = /*#__PURE__*/React.createElement("option", {
          value: item.id
        }, item.label);
      }

      return obj;
    }));
    let audio_devices = /*#__PURE__*/React.createElement("select", {
      onChange: this.audio_select
    }, this.state["devices"]["audioinput"].map(function (item) {
      let obj;

      if (item.label == audio_label) {
        obj = /*#__PURE__*/React.createElement("option", {
          selected: true,
          value: item.id
        }, item.label);
      } else {
        obj = /*#__PURE__*/React.createElement("option", {
          value: item.id
        }, item.label);
      }

      return obj;
    }));
    return /*#__PURE__*/React.createElement("div", {
      class: "settings-wrapper"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      name: "button",
      onClick: this.close_settings
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/times-solid.svg"
    })), /*#__PURE__*/React.createElement("video", {
      id: "settings-video",
      autoplay: "true",
      playsinline: "true"
    }), video_devices, audio_devices, /*#__PURE__*/React.createElement("div", {
      class: "visualize-audio-container"
    }, /*#__PURE__*/React.createElement("span", {
      id: "audio-line"
    })));
  }

}

ReactDOM.render( /*#__PURE__*/React.createElement(SettingsComponent, null), document.querySelector(".settings-modal"));
