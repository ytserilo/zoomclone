import {connection_manager} from "/static/js/event_loop.js";
import {CacheManager} from "/static/js/cache_manager.js";
// get permission
// activate event loop

// controll buttons, send_message, active_ether -> use React
export class MediaController{
  constructor(){
    this.constraints = {};

    const self = this;
    let promise = new Promise((resolve, reject) => {
      self.ready_status = {"status": false, "resolve": resolve};
    });
    this.ready_status["promise"] = promise;

    this.init();
  }

  async init(){
    const self = this;

    function preprocess(e){
      for(let key in e.detail){
        if(e.detail[key] == undefined){
          self.constraints[key] = false;
        }
        else{
          self.constraints[key] = {
            "deviceId": {exact: e.detail[key]},
          }
        }
      }

    }

    let promise = new Promise((resolve, reject) => {
      function media_device(e){
        preprocess(e);

        resolve(false);
        self.ready_status["resolve"](true);
        self.ready_status = {"status": true};

        document.removeEventListener("media-device", media_device);

        document.addEventListener("media-device", async function(e){
          preprocess(e);

          await self.get_permission(false);
          document.dispatchEvent(new CustomEvent("settings-media-device", {
            detail: {"tracks": self.tracks}
          }));

          for(let key in self.tracks){
            for(let conn_id in connection_manager.active_connections){
              let rtc = connection_manager.active_connections[conn_id];

              let clone_track = self.tracks[key].clone();

              if(key == "video"){
                let senders = rtc.rtc.getSenders();
                let track = senders.find(function(item){if(item.track.kind == key){return item.track}});
                let constraints = track.track.getConstraints();

                let current_constrains = clone_track.getConstraints();
                current_constrains["width"] = constraints["width"];
                current_constrains["height"] = constraints["height"];

                clone_track.applyConstraints(current_constrains);
              }

              connection_manager.replace_track(rtc.rtc, clone_track);
            }
            for(let conn_id in connection_manager.wait_connections){
              let rtc = connection_manager.wait_connections[conn_id];
              let clone_track = self.tracks[key].clone();

              if(key == "video"){
                let senders = rtc.rtc.getSenders();
                let track = senders.find(function(item){if(item.track.kind == key){return item.track}});
                let constraints = track.track.getConstraints();

                let current_constrains = clone_track.getConstraints();
                current_constrains["width"] = constraints["width"];
                current_constrains["height"] = constraints["height"];

                clone_track.applyConstraints(current_constrains);
              }

              connection_manager.replace_track(rtc.rtc, clone_track);
            }
          }
        });
      }

      document.addEventListener("media-device", media_device);
    });


    let result = await promise;
    return result;
  }

  check_allow(dct){
    let res = false;
    for(let key in dct){
      if(dct[key] != false){
        res = true;
        break;
      }
    }

    return res;
  }

  async get_permission(change_connection=true){
    const self = this;

    if(self.ready_status["status"] == false){
      await this.ready_status["promise"];
    }

    let constraints = this.constraints;

    if(this.check_allow(constraints) == false){
      document.dispatchEvent(new CustomEvent("new-media-connection", {
        detail: {
          "id": "self",
          "tracks": {"video": null, "audio": null},
        }
      }));
      return;
    }
    
    // try{
    //   let data = JSON.parse(await cache_manager.get("selected-device"));
    //   for(let kind in data){
    //     if(constraints[kind] == false){
    //       continue;
    //     }
    //     constraints[kind]["deviceId"]["exact"] = data[kind];
    //   }
    // }catch{}

    const promise = new Promise((resolve, reject) => {
      navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        self.stream = stream;
        self.tracks = {};

        stream.getTracks().forEach(function(track){
          if(change_connection == true){
            if(track.kind == "audio"){
              connection_manager.media_state["microphone"] = true;
            }
            else if(track.kind == "video"){
              connection_manager.media_state["video"] = true;
            }
          }
          if(track.kind == "audio"){
            track.enabled = connection_manager.media_state["microphone"];
          }
          else if(track.kind == "video"){
            track.enabled = connection_manager.media_state["video"];
          }

          self.tracks[track.kind] = track;
        });

        document.dispatchEvent(new CustomEvent("new-media-connection", {
          detail: {
            "id": "self",
            "tracks": self.tracks,
          }
        }));
        resolve(true);
      })
      .catch(function(err) {
        resolve(false);
      });
    });

    return promise;
  }
}
