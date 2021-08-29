function uint8_to_array(u8a){
  let CHUNK_SZ = 0x8000;
  let c = [];
  for(let i = 0; i < u8a.length; i += CHUNK_SZ){
    c.push(String.fromCharCode.apply(null, u8a.subarray(i, i + CHUNK_SZ)));
  }
  return btoa(c.join(""));
}


export class FileUploader{
  upload_file(connection_manager, file, file_id, key){
    const size = file.size;
    const file_type = file.type;

    let stream = file.stream();
    const reader = stream.getReader();

    let channel = connection_manager.active_connections[key].channel;

    let count_chunks = 0;
    reader.read().then(function process_data({done, value}) {
      if(done == true){
        channel.send(JSON.stringify({
          "type": "file",
          "mode": "done",
          "file-id": file_id,
          "chunk-index": count_chunks,
        }));
        return;
      }


      for(let i = 0; i < value.length; i += 10000){
        let slice_value = value.subarray(i, i + 10000);

        channel.send(JSON.stringify({
          "type": "file",
          "mode": "load",
          "file-id": file_id,
          "chunk-index": count_chunks,
          "chunk": uint8_to_array(slice_value), // new TextDecoder().decode(slice_value)//,
        }));
        count_chunks += 1;
      }

      return reader.read().then(process_data);
    }).catch(function(err){console.log(err)});
  }

  // var uint8array = new TextEncoder().encode("¢");
  // download_file(file_id){
//
  // }
}
