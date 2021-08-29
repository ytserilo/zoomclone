export class CacheManager{
  get(file_id, link=false){
    if(link == false){
      link = file_id;
    }

    let promise = new Promise((resolve, reject) => {
      caches.open(file_id).then(function(cache){
        let request = new Request("/cache?key={}".replace("{}", link));
        cache.match(request).then(async function(response) {
          resolve(await response.text());
        }).catch(function(){
          reject("not found");
        });
      });
    });

    return promise;
  }

  del(file_id){
    caches.open(file_id).then(function(cache){
      let request = new Request("/cache?key={}".replace("{}", file_id));

      cache.delete(request);
    });
  }

  put(file_id, value, link=false){
    caches.open(file_id).then(function(cache){
      if(link == false){
        link = file_id;
      }

      let request = new Request("/cache?key={}".replace("{}", link));
      let blob = new Blob([value], {type: "text/plain"});

      var init = {"status" : 200};
      let response = new Response(blob, init);

      cache.put(request, response);
    });
  }
}
