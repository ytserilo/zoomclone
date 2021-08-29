import {MediaController} from "/static/js/permission.js";
import {ConnectionManager} from "/static/js/connection_manager.js";
import {RTC} from "/static/js/rtc.js";
import {FileUploader} from "/static/js/file_uploader.js";


function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

let user_camera_mode = "";
let file_download_broadcast_store = {};
export let self_files_store = {};
export let users_store = {};


export let self_id;

let path_arr = window.location.pathname.split("/");
let session_params = document.cookie.split("; ").filter(function(item){
    if(item.startsWith("session-id") == true){
        return item;
     }
});
session_params = session_params[0].split("=");

let protocol = "wss";
if(window.location.protocol == "http:"){
  protocol = "ws";
}
let ws_link = protocol + "://"+window.location.host + "/" + path_arr[2]+"?session-id={}".replace("{}", decodeURIComponent(session_params[1]));
let websocket = new WebSocket(ws_link);
export const media = new MediaController();
export const connection_manager = new ConnectionManager();
const file_uploader = new FileUploader();

function restart_conn(){
  let new_websocket = new WebSocket(ws_link);
  new_websocket.onopen = websocket.onopen;
  new_websocket.onmessage = websocket.onmessage;

  websocket = new_websocket;
}
document.addEventListener("restart-conn", restart_conn);
// set loader with info about leader
// event listener to btn for send new offer


websocket.onopen = async function(){
  websocket.onmessage = async function(e){
    let data = undefined;
    try{
      data = JSON.parse(e.data);
    }catch{
      return;
    }

    if(data["type"] == "open"){
      self_id = data["id"];
      users_store[self_id] = data["bio"];

      await media.get_permission();
      let mic = document.querySelector("#mic");
      let cam = document.querySelector("#cam");

      mic.click(); mic.click();
      cam.click(); cam.click();

      if(data["owner"] == true){
        document.removeEventListener("restart-conn", restart_conn);

        document.addEventListener("accept-offer", function(e){
          let id = e.detail.id;
          websocket.send(JSON.stringify({
            "type": "accept-connect",
            "accept": true,
            "id": id,
          }))
        });
        document.addEventListener("cencell-offer", function(e){
          let id = e.detail.id;
          websocket.send(JSON.stringify({
            "type": "accept-connect",
            "accept": false,
            "id": id,
          }))
        });

        for(let key in data["users"]){
          let user = data["users"][key];
          document.dispatchEvent(new CustomEvent("new-offer", {
            detail: {"user": user}
          }));
        }
      }
      else{
        document.dispatchEvent(new CustomEvent("room-control", {
          detail: {
            "type": "success",
          }
        }));
        document.removeEventListener("restart-conn", restart_conn);
      }

      websocket.send(JSON.stringify({
        "type": "create-rtc-connection",
        "sender-id": self_id,
      }));
      return;
    }
    else if(self_id == undefined && data["type"] == "join-to-room"){
      document.dispatchEvent(new CustomEvent("room-control", {
        detail: {
          "type": "field",
        }
      }));
    }

    if(self_id != undefined){
      event_loop(data).then(function(body){
        if(body == false){
          return;
        }
        websocket.send(JSON.stringify(body));
      });
    }

  }

  websocket.onclose = function(){}
}

function sendMessage(message) {
  return new Promise(function(resolve, reject) {
    var messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = function(event) {
      if (event.data.error) {
        reject(event.data.error);
      } else {
        resolve(event.data);
      }
    };

    navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
  });
}
let download_queue = [];

export async function download(link, conn_id, file_size, file_name){
  let obj = download_queue.pop();

  let download_resolve;
  let download_promise = new Promise((resolve, reject) => {
    download_resolve = resolve;
  });
  download_queue.push(download_promise);

  if(obj != undefined){
    await obj;
  }
  // create queue
  file_download_broadcast_store[link] = new BroadcastChannel(link);
  await sendMessage({
    "type": "file",
    "mode": "create-broadcast",
    "link": link,
    "file-size": file_size,
    "file-name": file_name,
  });

  let promise = new Promise((resolve, reject) => {
    file_download_broadcast_store[link].onmessage = function(e){
      if(e.data["type"] == "file"){
        if(e.data["mode"] == "complete-broadcast"){
          resolve(true);
        }
      }
    }
    let a = document.createElement("a");
    a.href = window.location.origin + "/file_id?link={}".replace("{}", link);
    // a.download = file_name;
    a.target = "_blank";

    a.click();
  });

  await promise;

  function broadcast_onmessage(e){
    if(e.data["type"] == "close"){
      file_download_broadcast_store[link].close();
      file_download_broadcast_store[link].removeEventListener("message", broadcast_onmessage);
      delete file_download_broadcast_store[link];
      download_resolve(true);
    }
  }
  file_download_broadcast_store[link].addEventListener("message", broadcast_onmessage);

  connection_manager.active_connections[conn_id].channel.send(JSON.stringify({
    "type": "file",
    "sender-id": self_id,
    "mode": "get-file",
    "link": link,
  }));
}

export async function event_loop(data){
  let event_resolve = undefined;
  let promise = new Promise((resolve, reject) => {
    event_resolve = resolve;
  });

  // if(data["type"] == "complete"){
  //   event_resolve({
  //     "type": "create-rtc-connection",
  //     "sender-id": self_id,
  //   });
  //   return promise;
  // }
  // else
  if(data["type"] == "join-to-room"){
    document.dispatchEvent(new CustomEvent("new-offer", {
      detail: {
        user: data["user"]
      }
    }));
  }
  else if(data["type"] == "delete-waiter"){
    document.dispatchEvent(new CustomEvent("delete-offer", {
      detail: {
        id: data["id"]
      }
    }));
  }

  else if(data["type"] == "create-rtc-connection"){
    let result = connection_manager.find_connection(data["sender-id"]);
    if(result || data["sender-id"] == self_id){
      event_resolve(false);
      return promise;
    }
    users_store[data["sender-id"]] = data["sender-bio"];

    let rtc = new RTC();
    rtc.receiver_id = data["sender-id"];
    rtc.self_id = self_id;

    async function share_screen_conn(){
      rtc.removeEventListener("open", share_screen_conn);

      if(media.screen_stream == undefined){
        return;
      }

      let chat_id = "share-screen" + self_id;
      let share_screen_rtc = new RTC();
      share_screen_rtc.novideo = true;
      share_screen_rtc.receiver_id = data["sender-id"];
      share_screen_rtc.self_id = chat_id;

      let tracks = {};
      let clone_stream = media.screen_stream.clone()
      share_screen_rtc.stream = clone_stream;
      share_screen_rtc.rtc.removeEventListener("track", share_screen_rtc.ontrack_handler);

      clone_stream.getTracks().forEach(function(track){
        tracks[track.kind] = track;
        share_screen_rtc.rtc.addTrack(track, clone_stream);
      });
      share_screen_rtc.tracks = tracks;

      let offer = await share_screen_rtc.createOffer(chat_id + "||" + data["sender-id"]);
      connection_manager.add_new_connections(share_screen_rtc);

      media.screen_stream.addEventListener("inactive", function(e){
        let rtc_id = chat_id + "||" + data["sender-id"];
        let inactive_rtc = connection_manager.active_connections[rtc_id];
        media.screen_stream = undefined;

        inactive_rtc.rtc.close();
      });

      rtc.channel.send(JSON.stringify({
        "type": "offer",
        "offer": offer,
        "sender-id": chat_id,
        "receiver-id": data["sender-id"],
      }));
      return;
    }
    rtc.addEventListener("open", share_screen_conn);

    rtc.addEventListener("message", async function(e){
      let body;
      try{
        body = JSON.parse(e.detail);
      }catch{}

      let res = await event_loop(body);
      if(res == false){
        return;
      }

      rtc.channel.send(JSON.stringify(res));
    });

    let clone_stream = media.stream;
    for(let kind in media.tracks){
      rtc.rtc.addTrack(media.tracks[kind].clone(), clone_stream);
    }
    // rtc.rtc.addTrack(media.tracks["audio"]);

    let offer = await rtc.createOffer(self_id + "||" + data["sender-id"]);
    connection_manager.add_new_connections(rtc);
    // create connections with stream

    event_resolve({
      "type": "offer",
      "offer": offer,
      "sender-id": self_id,
      "receiver-id": data["sender-id"],
      "sender-bio": users_store[self_id],
    });
    return promise;
  }

  else if(data["type"] == "offer"){
    users_store[data["sender-id"]] = data["sender-bio"];

    let rtc = new RTC();
    rtc.receiver_id = data["sender-id"];
    rtc.self_id = self_id;

    rtc.addEventListener("message", async function(e){
      let body;
      try{
        body = JSON.parse(e.detail);
      }catch{}

      let res = await event_loop(body);
      if(res == false){
        return;
      }

      rtc.channel.send(JSON.stringify(res));
    });

    let clone_stream = media.stream.clone();
    for(let kind in media.tracks){
      rtc.rtc.addTrack(media.tracks[kind].clone(), clone_stream);
    }

    let answer = await rtc.createAnswer(data["offer"]);
    connection_manager.add_new_connections(rtc, data["sender-id"] + "||" + self_id);

    let body = {
      "type": "answer",
      "answer": answer,
      "sender-id": self_id,
      "receiver-id": data["sender-id"],
    };
    event_resolve(body);
    return promise;
  }
  else if(data["type"] == "answer"){
    let link = data["receiver-id"] + "||" + data["sender-id"];

    connection_manager.wait_connections[link].accept(data["answer"]);
  }
  else if(data["type"] == "change-media"){
    document.dispatchEvent(new CustomEvent("change-media", {
      detail: data
    }));
  }
  else if(data["type"] == "video-stream-control"){
    let conn = connection_manager.active_connections[data["conn-id"]];
    let senders = conn.rtc.getSenders();
    let track = senders.find(function(item){if(item.track.kind == "video"){return item.track}});
    
    if(track == undefined){
      return;
    }

    track = track.track;
    if(data["mode"] == "off"){
      track.enabled = false;
    }
    else{
      let constraints = track.getConstraints();
      constraints["width"] = data["width"];
      constraints["height"] = data["height"];

      track.applyConstraints(constraints);
      if(data["conn-id"].startsWith("share-screen") == true){
        track.enabled = true;
      }
      if(connection_manager.media_state["video"] == true){
        track.enabled = true;
      }
      // data["width"]
      // data["height"]
    }
  }
  else if(data["type"] == "file"){
    if(data["mode"] == "link"){
      let sender_person = users_store[data["sender-id"]];
      let sender_name = sender_person["first_name"] +" "+ sender_person["last_name"];
      sender_name = sender_name.replace("null", "");
      let photo_url = sender_person["photo_url"];
      if(sender_person["photo_url"] == null){
        photo_url = "/static/icons/unnamed.png";
      }

      document.dispatchEvent(new CustomEvent("message", {
        detail: {
          "file": {
            "link": data["file"]["link"],
            "file_name": data["file"]["file_name"],
            "size": data["file"]["size"],
            "sender-id": data["sender-id"],
            "sender_name": sender_name,
            "photo_url": photo_url,
          },
          "owner": "other",
          "message": "",
        }
      }));
    }
    else if(data["mode"] == "get-file"){
      // register download service
      let key = connection_manager.get_conn(data["sender-id"]);
      if(key == false){
        event_resolve(false);
        return promise;
      }
      file_uploader.upload_file(connection_manager, self_files_store[data["link"]], data["link"], key);
      // data["file-id"] find file in you library and send with chunks
    }
    else if(data["mode"] == "load"){
      file_download_broadcast_store[data["file-id"]].postMessage({
        "type": "file",
        "file-id": data["file-id"],
        "mode": "load",
        "chunk": data["chunk"],
        "index": data["chunk-index"],
      });
      // cache_manager.put(data["file-id"], data["chunk"], String(data["chunk-index"]));
    }
    else if(data["mode"] == "done"){

      file_download_broadcast_store[data["file-id"]].postMessage({
        "type": "file",
        "file-id": data["file-id"],
        "mode": "done",
        "index": data["chunk-index"],
      });
    }
    // image, file, video, music
  }
  else if(data["type"] == "message"){
    let sender_person = users_store[data["sender_id"]];
    let sender_name = sender_person["first_name"] +" "+ sender_person["last_name"];
    sender_name = sender_name.replace("null", "");

    let photo_url = sender_person["photo_url"];
    if(sender_person["photo_url"] == null){
      photo_url = "/static/icons/unnamed.png";
    }

    let message_data = {
      "text": data["message"],
      "sender_name": sender_name,
      "photo_url": photo_url,
    };
    document.dispatchEvent(new CustomEvent("message", {
      detail: {
        "file": false,
        "owner": "other",
        "message": message_data,
      }
    }));
    // data["sender-id"]
    // data["message"]
  }

  event_resolve(false);
  return promise;
}
