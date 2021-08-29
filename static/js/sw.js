let broadcast_store = {};
let file_waiters = {};

function rus_to_latin(str){
    let ru = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
        'е': 'e', 'ё': 'e', 'ж': 'j', 'з': 'z', 'и': 'i',
        'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh',
        'щ': 'shch', 'ы': 'y', 'э': 'e', 'ю': 'u', 'я': 'ya'
    }, n_str = [];

    str = str.replace(/[ъь]+/g, '').replace(/й/g, 'i');

    for (let i = 0; i < str.length; ++i) {
       n_str.push(
              ru[ str[i] ]
           || ru[ str[i].toLowerCase() ] == undefined && str[i]
           || ru[ str[i].toLowerCase() ].toUpperCase()
       );
    }

    return n_str.join('');
}

class FileWaiter extends EventTarget{
  constructor(file_size, file_name){
    super();
    this.file_name = file_name;
    this.file_size = file_size;
  }

  put(){
    const self = this;

    let promise = new Promise((resolve, reject) => {
      function put_handler(e){
        let data = e.detail;
        if(data.done == true){
          resolve({"done": data.done});
          self.removeEventListener("put", put_handler);
        }
        else{
          resolve({"chunk": data.chunk, "done": data.done});
        }
      }

      this.addEventListener("put", put_handler);
    });

    return promise;
  }

  read(){
    let promise = new Promise((resolve, reject) => {
      this.put().then(function(result){
        resolve(result);
      });
    });

    return promise;
  }
}

self.addEventListener('message', function(event) {
  if(event.data["type"] == "file"){
    if(event.data["mode"] == "create-broadcast"){
      broadcast_store[event.data["link"]] = new BroadcastChannel(event.data["link"]);
      file_waiters[event.data["link"]] = new FileWaiter(event.data["file-size"], event.data["file-name"]);

      event.ports[0].postMessage("ok");

      function broadcast_onmessage(e){
        if(e.data["type"] == "file"){
          if(e.data["mode"] == "load"){

            file_waiters[event.data["link"]].dispatchEvent(new CustomEvent(
              "put",
              {
              detail: {
                chunk: e.data["chunk"],
                done: false,
              }
            }));
          }
          else if(e.data["mode"] == "done"){
            file_waiters[event.data["link"]].dispatchEvent(new CustomEvent(
              "put",
              {
              detail: {
                done: true,
              }
            }));
            broadcast_store[event.data["link"]].postMessage({"type": "close"});
            broadcast_store[event.data["link"]].removeEventListener("message", broadcast_onmessage);
            delete broadcast_store[event.data["link"]];
          }
        }
      }
      broadcast_store[event.data["link"]].addEventListener("message", broadcast_onmessage);
    }
  }
  // event.ports[0].postMessage({'test': 'This is my response.'});
});

function check_file_url(url){
  let url_arr = url.split("?");
  if(url_arr.length < 2){
    return false;
  }

  let address = url_arr[0];
  let params = url_arr[1];
  if(address != self.location.origin+'/file_id'){
    return false;
  }

  params = params.split("=");
  if(params.length < 2){
    return false;
  }

  let link = params[1];

  if(file_waiters[link] == undefined){
    return false;
  }

  return link;
}
self.addEventListener('fetch', function(event) {

})
self.addEventListener('fetch', (event) => {
  let file_id = check_file_url(event.request.url);
  if(file_id != false){
    event.respondWith(fetch(event.request.url).then(async function(response){
      broadcast_store[file_id].postMessage({
        "type": "file",
        "mode": "complete-broadcast",
      });

      let promise = new Promise((resolve, reject) => {
        let file_waiter = file_waiters[file_id];

        let readable_stream = new ReadableStream({
          start(controller) {
            // The following function handles each data chunk
            file_waiter.read().then(function process_data(e){
              if(e.done == true){
                controller.close();
                delete file_waiters[file_id];
                return;
              }

              let uint8array = new Uint8Array(atob(e.chunk).split("").map(function(c){return c.charCodeAt(0); }));
              // let uint8array = new TextEncoder().encode(e.chunk);
              controller.enqueue(uint8array);

              file_waiter.read().then(process_data);
            }).catch(function(err){});
          }
        });
        let headers = {
          "Content-Length": file_waiter.file_size,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": "attachment; filename={}".replace("{}", rus_to_latin(file_waiter.file_name)),
        }
        let resp = new Response(readable_stream, { "headers": headers });
        resolve(resp);
      });
      return promise;
    }));
  }
});
