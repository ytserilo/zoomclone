import {self_id} from "/static/js/event_loop.js";

export class ConnectionManager extends EventTarget{
  constructor(){
    super();
    this.active_connections = {};
    this.wait_connections = {};
    this.media_state = {"video": false, "microphone": false};
    document.addEventListener("quality-handler", this.quality_handler);
  }

  toggle_tracks(status, device_type){
    for(let id in this.active_connections){
      if(id.startsWith("share-screen") == true){
        continue;
      }

      let conn = this.active_connections[id];

      let senders = conn.rtc.getSenders();
      let track = senders.find(function(item){
        if(item.track.kind == device_type){
          return true;
        }
      });
      if(track == undefined){
        return;
      }
      track = track.track;
      track.enabled = status;
    }
  }

  send_message(data){
    for(let conn_id in this.active_connections){
      this.active_connections[conn_id].channel.send(JSON.stringify(data));
    }
  }

  get_other_id(key){
    let users = key.split("||");

    if(users[0] == self_id){
      return users[1];
    }
    else if(users[1] == self_id){
      return users[0];
    }
    else{
      return false;
    }
  }

  get_conn(other_key){
    // if(this.get_other_id(other_key) == false){
    //   return false;
    // }

    let rtc1 = this.active_connections[self_id + "||" + other_key];
    if(rtc1 == undefined){
      let rtc2 = this.active_connections[other_key + "||" + self_id];
      return other_key + "||" + self_id;
    }
    else{
      return self_id + "||" + other_key;
    }
  }



  find_connection(sender_id){
    let found = false;

    let rtc1 = this.active_connections[self_id + "||" + sender_id];
    if(rtc1 == undefined){
      let rtc2 = this.active_connections[sender_id + "||" + self_id];
      if(rtc2 != undefined){
        found = true;
      }
    }
    else{
      found = true;
    }

    if(found){
      return true;
    }

    rtc1 = this.wait_connections[self_id + "||" + sender_id];
    if(rtc1 == undefined){
      let rtc2 = this.wait_connections[sender_id + "||" + self_id];
      if(rtc2 != undefined){
        found = true;
      }
    }
    else{
      found = true;
    }

    return found;
  }

  replace_track(rtc, track){
    if(track.kind == "video"){
      track.enabled = this.media_state["video"];
    }
    else if(track.kind == "audio"){
      track.enabled = this.media_state["microphone"];
    }

    let sender = rtc.getSenders().find(function(s){
      return s.track.kind == track.kind;
    });

    sender.replaceTrack(track);
  }

  add_new_connections(rtc, label=false){
    let id = "";
    if(label != false){
      id = label;
    }
    else{
      id = rtc.channel.label;
    }

    this.wait_connections[id] = rtc;
    const self = this;

    function wait_close_connection_handler(){
      let id = this.channel.label;

      self.wait_connections[id].removeEventListener("close-channel", wait_close_connection_handler);
      self.wait_connections[id].removeEventListener("open-channel", wait_open_connection_handler);

      delete self.wait_connections[id];
    }

    function wait_open_connection_handler(){
      let id = this.channel.label;

      self.active_connections[id] = self.wait_connections[id];
      let send_data = {
        "type": "change-media",
        "mode": "audio",
        "status": self.media_state["microphone"],
        "conn-id": id,
        "sender_id": self_id
      }
      if(id.startsWith("share-screen") == false){
        this.channel.send(JSON.stringify(send_data));
      }

      send_data["mode"] = "video";
      send_data["status"] = self.media_state["video"];
      if(id.startsWith("share-screen") == false){
        this.channel.send(JSON.stringify(send_data));
      }

      if(self.active_connections[id].novideo != true){
        document.dispatchEvent(new CustomEvent("new-media-connection", {
          detail: {
            "id": id,
            "tracks": self.active_connections[id].tracks,
          }
        }));
      }

      self.wait_connections[id].removeEventListener("open-channel", wait_open_connection_handler);
      self.wait_connections[id].removeEventListener("close-channel", wait_close_connection_handler);

      delete self.wait_connections[id];

      function close_active_connection(){
        let id = this.channel.label;

        if(self.active_connections[id].novideo != true){
          document.dispatchEvent(new CustomEvent("close-media-connection", {
            detail: {
              "id": id,
            }
          }));
        }


        self.active_connections[id].removeEventListener("close-channel", close_active_connection);
        delete self.active_connections[id];
      }
      self.active_connections[id].addEventListener("close-channel", close_active_connection);
    }

    this.wait_connections[id].addEventListener("open-channel", wait_open_connection_handler);
    this.wait_connections[id].addEventListener("close-channel", wait_close_connection_handler);
  }
}
