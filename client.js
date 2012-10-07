var http = require('http');
var fs   = require('fs');

// Fragment availability map, which is just an `array[image_id][fragment_id]`
// of fragment objects.
var fragments = Array.apply(null, Array(1)).map(function () {
  return Array.apply(null, Array(100)).map(function () { return null; });
});

function isReceived(fragment) {
  return !!fragments[fragment.image_id - 1][fragment.fragment_id - 1];
}

function markAsReceived(fragment) {
  var isNew = !isReceived(fragment);
  fragments[fragment.image_id - 1][fragment.fragment_id - 1] = fragment;
  return isNew;
}

function gotAllImageFragments(imageId) {
  imageId = imageId - 1; // argument is 1-based, index is 0-based
  for (var i = 0; i < fragments[imageId].length; i++) {
    if (!fragments[imageId][i]) return false;
  }
  return true;
}

function gotAllFragments() {
  for (var i = 1; i <= fragments.length; i++) { // 1-based `image_id`s
    if (!gotAllImageFragments(i)) return false;
  }
  return true;
};

//
// Repeatedly issues requests to a server until we have all fragments of all
// images, then fires a `done` callback.
//
function getAllFragments(done) {
  var endpoint = 0;

  function _getAllFragments() {
    getFragment(endpoint + 1, function (fragment) {
      if (gotAllFragments()) {
        done();
      } else {
        // Round-robin poll endpoints.
        endpoint = (endpoint + 1) % 5;
        _getAllFragments(done);
      }
    });
  }

  // Start the polling cycle.
  _getAllFragments();
}

//
// Issues a single request to a server and calls `done` when a previously
// unseen fragment is encountered.
//
function getFragment(endpoint, done) {
  var request = http.get('http://localhost:8080/endpoint' + endpoint);
  request.on('response', function (response) {
    // Collect all incoming data into a single big string.
    var body = '';
    response.on('data', function (chunk) {
      body += chunk;
    });

    // Process the received data when the response is complete.
    response.on('end', function () {
      var fragment = JSON.parse(body);

      // If it'a new fragment, mark it as received and return it.
      if (markAsReceived(fragment)) {
        return done(fragment);
      }
      // Otherwise, indicate that no new fragment was received.
      done(null);
    });
  });
}

function writeFragments(done) {
  for (var i = 0; i < fragments.length; i++) {
    // Fragments of i-th image.
    var imageFragments = fragments[i];

    var fd = fs.openSync(imageFragments[0].image_name, 'w');

    for (var j = 0; j < imageFragments.length; j++) {
      var fragment = imageFragments[j];
      var buffer = new Buffer(fragment.content, 'base64');

      var toWrite = buffer.length;
      var offset = 0;
      while (toWrite > 0) {
        var written = fs.writeSync(fd, buffer, offset, toWrite);
        if (written < toWrite) process.stdout.write('!');
        toWrite -= written;
        offset += written;
      }
    }

    fs.closeSync(fd);
  }

  done();
}

// Start the stopwatch and go get 'em all
var timeStart = Date.now();
getAllFragments(function () {
  console.log('Received all image fragments in %dms, writing files...', Date.now() - timeStart);
  writeFragments(function () {
    console.log('All done. Total time taken %dms', Date.now() - timeStart);
  });
});