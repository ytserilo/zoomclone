let main_dir = __dirname.split("/");
main_dir = main_dir.slice(0, main_dir.length - 1).join("/")

const user_model = require(main_dir + "/User/model.js");
const client = require(main_dir + "/settings.js");


module.exports = function(req, resp, next){
  async function wrapper(req, resp){
    let session = req.cookies["session-id"];

    if(session == undefined){
      req.user = false;
      return;
    }
    let [session_id, user_id] = session.split(":");

    let promise = new Promise((resolve, reject) => {
      client.get(user_id, function(err, reply){
        if(reply == null){
          resolve(false);
        }
        else{
          resolve(JSON.parse(reply));
        }

      });
    });

    let session_data = await promise;
    if(session_data == false){
      // resp.cookie("session-id", "", {maxAge: 0, httpOnly: false});
      req.user = false;
      return;
    }

    if(session_data["session-id"] != session_id){
      req.user = false;
      return;
    }

    if(user_id == undefined){
      req.user = false;
      return;
    }

    let user_obj = await user_model.User.findByPk(Number(user_id));

    if(user_obj == false){
      req.user = false;
      return;
    }
    else{
      req.csrf_token = session_data["token"];
      req.user = user_obj;
      return;
    }
  }
  wrapper(req, resp).then(function(){
    next();
  });

}
