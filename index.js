const express = require("express");
const http = require("http");
const auth = require("./User/controller.js");
const cookieParser = require('cookie-parser');
const csrf_protect = require("./middleware/csrf.js");
const get_user = require("./middleware/get_user.js");
const client = require("./settings.js")
const user_model = require("./User/model.js");

const EventEmitter = require('events');
const WebSocket = require('ws');

// https://api.telegram.org/bot1940505631:AAG5vi25Ebjpu4v1oaBcpYMd5VjGRUm-tBc/setWebhook?url=https://74e6532cbc5e.ngrok.io/telegram_webhook

function uuidv4() {
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
   var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
   return v.toString(16);
 });
}

const app = express();
app.set("view engine", "hbs");

app.use(express.json());
app.use(cookieParser());
app.use(get_user);
app.use(csrf_protect);

const server = http.createServer(app)
const jsonParser = express.json();

let serve_static = express.static(__dirname + "/static");
app.use("/static", function(req, res, next){
  if(req.url == "/js/sw.js"){
    res.setHeader("Service-Worker-Allowed", "/");
  }
  serve_static(req, res, next);
});

let websocket_client_store = {};
let websocket_waiter_store = {};

const wsServer = new WebSocket.Server({ server });

class RoomEmitter extends EventEmitter {}
const room_emitter = new RoomEmitter();

async function onConnect(wsClient, req) {
  // if you owner open room else send request to connect
  let parts = req.url.split("?");
  let session_part = parts.find(function(item){
    if(item.startsWith("session-id") == true){
      return item;
    }
  });

  let session_id = session_part.split("=");
  req.cookies = {"session-id": decodeURI(session_id[1])};

  let user_promise = new Promise((resolve, reject) => {
    get_user(req, {}, resolve);
  });
  await user_promise;

  const room_id = Number(parts[0].split("/")[1]);

  if(req.user == null || req.user == false){
    wsClient.send(JSON.stringify({"type": "redirect"}));
    wsClient.close();
  }

  if(websocket_client_store[room_id] == undefined){
    websocket_client_store[room_id] = {};
  }

  let roomObj = await user_model.Room.findByPk(room_id);
  console.log(roomObj.dataValues, req.user.id)
  if(roomObj == null){
    wsClient.send(JSON.stringify({"type": "redirect"}));
    wsClient.close();
  }
  else if(roomObj.userId != req.user.id){
    if(websocket_client_store[room_id][roomObj.userId] == undefined){
      wsClient.send(JSON.stringify({
        "type": "owner",
        "description": "Owner not in room wait",
        "room-id": room_id,
      }));
    }

    client.get(String(room_id), function(err, reply){
      let not_found_conn = true;
      if(reply == null){
        let room_data = {};
        room_data[req.user.id] = req.user.dataValues;
        not_found_conn = false;

        client.setex(String(room_id), 60 * 60 * 24, JSON.stringify({
          "wait-connections": room_data
        }));
      }
      else{
        let room_data = JSON.parse(reply);

        if(room_data["wait-connections"][req.user.id] == undefined){
          room_data["wait-connections"][req.user.id] = req.user.dataValues;
          client.setex(String(room_id), 60 * 60 * 24, JSON.stringify(room_data));
          not_found_conn = false;
        }

      }

      if(not_found_conn == false && websocket_client_store[room_id][roomObj.userId] != undefined){
        websocket_client_store[room_id][roomObj.userId].send(JSON.stringify({
          "type": "join-to-room",
          "room-id": room_id,
          "user": req.user.dataValues,
        }));
      }
    });

    let promise = new Promise((resolve, reject) => {
      wsClient.on("close", async function(){
        client.get(String(room_id), function(err, reply){
          if(reply != null){
            let conn_id = req.user.id;
            let data = JSON.parse(reply);

            if(data["wait-connections"][conn_id] != undefined){
              delete websocket_waiter_store[room_id][data["id"]];
              delete data["wait-connections"][conn_id];

              if(JSON.stringify(data["wait-connections"]).length == 2){
                client.del(String(room_id));
              }
              else{
                client.setex(String(room_id), 60 * 60 * 24, JSON.stringify(data));
              }
              if(websocket_client_store[room_id] == undefined){
                return;
              }
              if(websocket_client_store[room_id][roomObj.userId] == undefined){
                return;
              }
              websocket_client_store[room_id][roomObj.userId].send(JSON.stringify({
                "type": "delete-waiter",
                "id": conn_id,
              }));
            }

          }
        });
      });

      function onmessage(data){
        if(data["type"] == "accept-join"){
          client.get(String(room_id), function(err, reply){
            if(reply != null){
              let room_data = JSON.parse(reply);
              delete room_data["wait-connections"][req.user.id];
              if(JSON.stringify(room_data["wait-connections"]).length == 2){
                client.del(String(room_id));
              }
              else{
                client.setex(String(room_id), 60 * 60 * 24, JSON.stringify(room_data));
              }
            }
          });

          if(data["accept"] == true){
            wsClient.removeListener("status-change", onmessage);
            wsClient.send(JSON.stringify({"type": "open", "id": req.user.id, "bio": req.user.dataValues}));
            websocket_client_store[room_id][req.user.id] = wsClient;

            resolve(true);
          }
          else{
            wsClient.send(JSON.stringify({"type": "join-to-room", "status": "filed"}));

            resolve(false);
          }
        }
      }
      wsClient.on("status-change", onmessage);
    });
    if(websocket_waiter_store[room_id] == undefined){
      websocket_waiter_store[room_id] = {};
      websocket_waiter_store[room_id][req.user.id] = wsClient;
    }
    else{
      websocket_waiter_store[room_id][req.user.id] = wsClient;
    }

    let result = await promise;
    if(result == false){
      wsClient.close();
      return;
    }
    delete websocket_waiter_store[room_id][req.user.id];
  }
  else{
    let client_promise = new Promise((resolve, reject) => {
      client.get(String(room_id), function(err, reply){
        let wait_conns = {};
        if(reply != null){
          let room_data = JSON.parse(reply);
          wait_conns = room_data["wait-connections"];
        }
        resolve(wait_conns);
      });
    });
    let wait_conns = await client_promise;

    websocket_client_store[room_id][req.user.id] = wsClient;
    wsClient.send(JSON.stringify({
      "type": "open",
      "id": req.user.id,
      "bio": req.user.dataValues,
      "owner": true,
      "users": wait_conns,
    }));
  }

  let conn_id = req.user.id;
  wsClient.on('message', function(message) {
    let data;
    try{
      data = JSON.parse(message.toString());
    }catch{
      return;
    }

    if(data["type"] == "create-rtc-connection"){
      if(websocket_client_store[room_id] == undefined){
        wsClient.close();
        return;
      }
      let user_data = req.user.dataValues;
      delete user_data["id"];

      for(let key in websocket_client_store[room_id]){
        if(key == conn_id){
          continue;
        }
        let receiver_client = websocket_client_store[room_id][key];
        data["sender-bio"] = user_data;
        receiver_client.send(JSON.stringify(data));
      }

    }
    else if(data["type"] == "accept-connect"){
      if(conn_id == roomObj.userId){
        let conn = websocket_waiter_store[room_id][data["id"]];
        if(conn == undefined){
          return;
        }
        conn.emit("status-change", {
          "type": "accept-join",
          "accept": data["accept"],
        });
      }
    }
    else{
      let receiver_client = websocket_client_store[room_id][data["receiver-id"]];
      if(receiver_client == undefined){
        return;
      }

      receiver_client.send(JSON.stringify(data));
    }
  });

  wsClient.on("close", async function(){
    delete websocket_client_store[roomObj.id][conn_id];
    if(JSON.stringify(websocket_client_store[roomObj.id]).length == 2){
      delete websocket_client_store[roomObj.id];
    }
  });
}
wsServer.on('connection', onConnect);
app.get("/test", function(request, response){
  return response.render(__dirname + "/Chat/templates/test.hbs", {})
})
app.post("/manage-room", async function(request, response){
  // create update delete
  // check form and count rooms and delete room with timeout
  let body = request.body;

  if(request.user == false || request.user == null){
    response.json({"type": "critical-error"});
    return;
  }
  if(request.csrf == false){
    response.json({"type": "critical-error"});
    return;
  }

  if(body["type"] == "create-room"){
    let rooms = await request.user.getRooms();
    if(rooms.length < 5){
      if(body["name"] == undefined || body["name"] == ""){
        response.json({"type": "error", "description": "name field don't can empty"});
        return;
      }

      for(let i = 0; i < rooms.length; i++){
        if(rooms[i].name == body["name"]){
          response.json({"type": "error", "description": "this name is not available"});
          return;
        }
      }

      await request.user.createRoom({
        "name": body["name"],
      });

      rooms = await request.user.getRooms();
      for(let i = 0; i < rooms.length; i++){
        if(rooms[i]["name"] == body["name"]){
          response.json({"type": "success", "room": rooms[i].dataValues});
          return;
        }
      }
    }
    else{
      response.json({"type": "error", "description": "you can't have more then 5 rooms"});
      return;
    }
  }
  else if(body["type"] == "edit-room"){
    let rooms = await request.user.getRooms();

    let room_obj;
    for(let i = 0; i < rooms.length; i++){
      if(rooms[i].id == body["id"]){
        room_obj = rooms[i];
        break;
      }
    }

    if(room_obj == undefined){
      response.json({"type": "error", "description": "this room is not available"});
      return;
    }

    if(body["name"] == undefined){
      response.json({"type": "error", "description": "name field don't can empty"});
      return;
    }

    for(let i = 0; i < rooms.length; i++){
      if(rooms[i].name == body["name"]){
        response.json({"type": "error", "description": "name is not available"});
        return;
      }
    }

    room_obj.name = body["name"];
    user_model.Room.update({ name: body["name"] }, {
      where: {
        id: room_obj.id,
      }
    });

    response.json({"type": "success"});
  }
  else if(body["type"] == "delete-room"){
    user_model.Room.destroy({
      where: {
        id: body["id"],
        userId: request.user.id,
      }
    });
    response.json({"type": "success"});
  }
  else{
    response.json({"type": "critical-error"});
  }
});


app.get("/room/:room_id", async function(request, response) {
  let room_id = request.params["room_id"];

  if(request.user == false){
    response.redirect("/");
    return;
  }

  let room_obj = await user_model.Room.findByPk(Number(room_id));

  if(room_obj == null){
    response.redirect("/");
    return;
  }
  else{
    let now_date = new Date();
    let one_day_delay = 1000 * 60 * 60 * 24;

    if(now_date - room_obj.date_created > one_day_delay){
      user_model.Room.destroy({
        where: {
          id: room_obj.id,
        }
      })
      response.redirect("/");
      return;
    }

    let room_user = await user_model.User.findByPk(room_obj.userId);
    let render_data = {
      "csrf-token": request.csrf_token,
      "user": false,
      "room": {
        "name": room_obj.name,
        "user": room_user,
      },
    };
    if(room_obj.userId == request.user.id){
      render_data["user"] = request.user;
    }
    response.render(__dirname + "/Chat/templates/index.hbs", render_data);
  }

  // check owner room if you owner delete if timeout else get join requests
  // else check room timeout and delete it else send connect request to redis
});
app.use("/", jsonParser, async function(request, response){
  // console.log(request.user)
  if(request.method == "POST"){
    // type login
    let res = await auth.login(response, request.body);

    response.json({"result": res});
  }
  else{
    if(request.xhr){
      if(request.user != null && request.user != false){
        let rooms = await request.user.getRooms();
        let now_date = new Date();
        let one_day_delay = 1000 * 60 * 60 * 24;

        for(let i = 0; i < rooms.length; i++){
          if(now_date - rooms[i].date_created > one_day_delay){
            user_model.Room.destroy({
              where: {
                id: rooms[i].id,
              }
            })
          }
          else{
            rooms[i] = rooms[i].dataValues;
          }
        }
        response.json({"type": "success", "rooms": rooms});
      }
      else{
        response.json({"type": "error"});
      }
    }
    else{
      let render_data = {
        "user": request.user,
        "csrf_token": request.csrf_token,
      };

      response.render(__dirname + "/Chat/templates/user.hbs", render_data);
    }

  }
});

let port = process.env.PORT || 1234;
server.listen(port);
