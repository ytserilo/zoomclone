const client = require("/home/yardzen/oly/settings.js");
const crypto = require("crypto");

const user_model = require("/home/yardzen/oly/User/model.js");

function uuidv4() {
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
   var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
   return v.toString(16);
 });
}

module.exports = function(req, resp, next){
  async function wrapper(req, resp){
    if(req.method != "POST"){
      return;
    }
    if(req.user == false || req.user == null){
      return;
    }

    let user_id = String(req.user.id);

    let promise = new Promise((resolve, reject) => {
      client.get(user_id, function(err, reply){
        if(reply == null){
          req.csrf = false;
          resolve(false);
        }
        else{
          resolve(JSON.parse(reply));
        }

      })
    });

    let user_data = await promise;

    if(user_data == false){
      // resp.cookie("session-id", "", {maxAge: 0, httpOnly: false});
      req.csrf = false;
      return;
    }

    let token = req.body["csrf-token"];

    if(token == undefined){
      req.csrf = false;
      return;
    }

    let user_obj = await user_model.User.findByPk(user_id);
    if(user_obj == false){
      req.csrf = false;
      return;
    }

    let now_date = new Date();
    now_date = now_date.getTime();

    let one_week_delay = 1000 * 60 * 60 * 24 * 7;

    if(now_date - user_data["auth-date"] > one_week_delay){
      req.csrf = false;
      return;
    }

    if(user_data["token"] != token){
      req.csrf = false;
      return;
    }

    req.csrf = true;

  }
  wrapper(req, resp).then(function(){
    next();
  });

}
