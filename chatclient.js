"use strict";
var connection = null;
var clientID = 0;

var WebSocket = WebSocket || MozWebSocket;

var myPeerConnection = null;
var myUsername = null;
var targetUsername = null;
var localStream = null;

/////////////////////////////////////////////
// connection websocket et bindings ui

function setUsername() {
    const name = document.getElementById("name").value;
    myUsername = name;

    var msg = {
        name,
        date: Date.now(),
        id: clientID,
        type: "username"
    };
    connection.send(JSON.stringify(msg));
}

function connect() {
    var serverUrl = "ws://localhost:6503";

    connection = new WebSocket(serverUrl);

    connection.onopen = function(evt) {
        console.log('client is now connected to server');
        document.getElementById("text").disabled = false;
        document.getElementById("send").disabled = false;
    };

    connection.onmessage = handleMessage;
}

function send() {
    var msg = {
        text: document.getElementById("text").value,
        type: "message",
        id: clientID,
        date: Date.now()
    };
    connection.send(JSON.stringify(msg));
    document.getElementById("text").value = "";
}

function handleKey(evt) {
    if (evt.keyCode === 13 || evt.keyCode === 14) {
        if (!document.getElementById("send").disabled) {
            send();
        }
    }
}

function handleUserlistMsg(msg) {
    var i;
    var listElem = document.getElementById("userlistbox");

    while (listElem.firstChild) {
        listElem.removeChild(listElem.firstChild);
    }

    for (i = 0; i < msg.users.length; i++) {
        var item = document.createElement("li");
        item.appendChild(document.createTextNode(msg.users[i]));
        item.addEventListener("click", invite, false);

        listElem.appendChild(item);
    }
}

////////////////////////////////////////////////
// setup send & receive message

function handleMessage(evt) {
    var f = document.getElementById("chatbox").contentDocument;
    var text = "";
    var msg = JSON.parse(evt.data);
    var time = new Date(msg.date);
    var timeStr = time.toLocaleTimeString();

    console.log('connection.onmessage start', msg);

    switch (msg.type) {
        case "id":
            clientID = msg.id;
            setUsername();
            break;
        case "username":
            text = "<b>User <em>" + msg.name + "</em> signed in at " + timeStr + "</b><br>";
            break;
        case "message":
            text = "(" + timeStr + ") <b>" + msg.name + "</b>: " + msg.text + "<br>";
            break;
        case "rejectusername":
            text = "<b>Your username has been set to <em>" + msg.name + "</em> because the name you chose is in use.</b><br>";
            break;
        case "userlist":
            handleUserlistMsg(msg);
            break;
        case "video-offer":
            handleVideoOfferMsg(msg);
            break;
        case "video-answer":
            handleVideoAnswerMsg(msg);
            break;
        case "new-ice-candidate":
            handleNewIceCandidateMsg(msg);
            break;
        case "hang-up":
            hangUpCall();
            break;
    }

    if (text.length) {
        f.write(text);
    }
}

function sendToServer(msg) {
    var msgJSON = JSON.stringify(msg);
    connection.send(msgJSON);
}

////////////////////////////////////////////////////
// webrtc setup

var mediaConstraints = {
    video: true,
    audio: false
};

function invite(evt) {
    if (myPeerConnection) {
        alert("you can't start a call because you already have one open.");
        return;
    }

    const clickedUsername = evt.target.textContent;

    if (clickedUsername === myUsername) {
        alert("you can't talk to yourself.");
        return;
    }

    console.log('invite start');

    targetUsername = clickedUsername;

    navigator.mediaDevices.getUserMedia(mediaConstraints)
    .then((stream) => {
        localStream = stream;
        document.getElementById("local_video").srcObject = localStream;

        createPeerConnection(true);
        //myPeerConnection.addStream(localStream);
    })
    .catch(handleGetUserMediaError);
}

function handleGetUserMediaError(e) {
    console.log('handleGetUserMediaError');

    switch (e.name) {
        case "NotFoundError":
            alert("Unable to open your call because no camero and/or microphone found");
            break;
        case "SecurityError":
        case "PermissionDeniedError":
            // do nothing: this is the same as the user canceling the call.
            break;
        default:
            alert("Error opening your camera and/or microphone: " + e.message);
            break;
    }

    closeVideoCall();
}

function createPeerConnection(isInitiator) {
    console.log('createPeerConnection start');

    try {
        myPeerConnection = new RTCPeerConnection(null);

        console.log('myPeerConnection 1', myPeerConnection);

        myPeerConnection.onicecandidate = handleIceCandidateEvent;
        myPeerConnection.onaddstream = handleRemoteStreamAdded;
        myPeerConnection.addStream(localStream);


        myPeerConnection.onconnectionstatechange = handleConnectionStateChangeEvent;
        myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
        myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
        myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;

        console.log('myPeerConnection 2', myPeerConnection);

        if (isInitiator) {
            createOffer();
        }
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
    }

}

function handleICEConnectionStateChangeEvent(event) {
    console.log('handleICEConnectionStateChangeEvent trigger', myPeerConnection.iceConnectionState);

    switch(myPeerConnection.iceConnectionState) {
        case "closed":
        case "failed":
        case "disconnected":
            closeVideoCall();
            break;
    }
}

function handleSignalingStateChangeEvent(event) {
    console.log('handleSignalingStateChangeEvent trigger', myPeerConnection.iceConnectionState);

    switch(myPeerConnection.signalingState) {
        case "closed":
            closeVideoCall();
            break;
    }
};

function handleICEGatheringStateChangeEvent(event) {
    // Our sample just logs information to console here,
    // but you can do whatever you need.

    console.log('handleICEGatheringStateChangeEvent trigger', event);
}

function handleConnectionStateChangeEvent(event) {

    console.log('handleConnectionStateChangeEvent trigger', pc.connectionState);

    // switch(pc.connectionState) {
    //   case "connected":
    //     // The connection has become fully connected
    //     break;
    //   case "disconnected":
    //   case "failed":
    //     // One or more transports has terminated unexpectedly or in an error
    //     break;
    //   case "closed":
    //     // The connection has been closed
    //     break;
    // }
}

function createOffer() {
    console.log('createOffer start');

    function setLocalAndSendMessage(sessionDescription) {
        myPeerConnection.setLocalDescription(sessionDescription);
        console.log('setLocalAndSendMessage sending message', sessionDescription);

        sendToServer({
            name: myUsername,
            target: targetUsername,
            type: 'video-offer',
            sdp: myPeerConnection.localDescription
        });
    }

    const handleError = (err) => {
        console.log('createOffer error', err)
    };

    myPeerConnection.createOffer(setLocalAndSendMessage, handleError);
}

function handleVideoOfferMsg(msg) {
    console.log('handle video-offer start');

    targetUsername = msg.name;
    createPeerConnection(false);

    var desc = new RTCSessionDescription(msg.sdp);

    myPeerConnection.setRemoteDescription(desc)
    .then(() => {
        return navigator.mediaDevices.getUserMedia(mediaConstraints);
    })
    .then((localStream) => {
        document.getElementById('local_video').srcObject = localStream;

        localStream.getTracks()
        .forEach(track => myPeerConnection.addTrack(track, localStream));
    })
    .then(() => {
        return myPeerConnection.createAnswer();
    })
    .then((answer) => {
        console.log('answer is', answer);
        return myPeerConnection.setLocalDescription(answer);
    })
    .then(() => {
        var msg = {
            name: myUsername,
            target: targetUsername,
            type: 'video-answer',
            sdp: myPeerConnection.localDescription
        };

        console.log('handleVideoOfferMsg localDescription is', msg);

        sendToServer(msg);
    })
    .catch(handleGetUserMediaError);
}

function handleVideoAnswerMsg(msg) {
    console.log('handle video-answer start', msg);

    var desc = new RTCSessionDescription(msg.sdp);

    myPeerConnection.setRemoteDescription(desc)
    .catch((error) => console.log('handleVideoAnswerMsg ERROR', error));
}

function handleIceCandidateEvent(event) {
    console.log('handleIceCandidateEvent start', event);

    if (event.candidate) {
        sendToServer({
            type: 'new-ice-candidate',
            target: targetUsername,
            candidate: event.candidate.candidate,
            label: event.candidate.sdpMLineIndex
        });
    }
}

function handleNewIceCandidateMsg(msg) {
    console.log('handleNewIceCandidateMsg start', msg);

    // pass the received SDP to the constructor
    //var candidate = new RTCIceCandidate(msg.candidate);
    var candidate = new RTCIceCandidate({
        sdpMLineIndex: msg.label,
        candidate: msg.candidate
    });

    // delivers the candidate to the ICE layer
    myPeerConnection.addIceCandidate(candidate)
    .catch((error) => console.log('handleNewIceCandidateMsg error', error));
}

// Called by the WebRTC layer when events occur on the media tracks
// on our WebRTC call. This includes when streams are added to and
// removed from the call.
//
// track events include the following fields:
//
// RTCRtpReceiver       receiver
// MediaStreamTrack     track
// MediaStream[]        streams
// RTCRtpTransceiver    transceiver

// function handleTrackEvent(event) {
//     console.log("*** handleTrackEvent");
//     document.getElementById("received_video").srcObject = event.streams[0];
//     document.getElementById("hangup-button").disabled = false;
// }

// Called by the WebRTC layer when a stream starts arriving from the
// remote peer. We use this to update our user interface, in this
// example.

function handleRemoteStreamAdded(event) {
    console.log("*** Stream added");
    document.getElementById("received_video").srcObject = event.stream;
    document.getElementById("hangup-button").disabled = false;
}

// function handleRemoveTrackEvent(event) {
//     var stream = document.getElementById("received_video").srcObject;
//     var trackList = stream.getTracks();

//     if (!trackList.length) {
//         closeVideoCall();
//     }
// }

// function hangUpCall() {
//     console.log('hangUpCall start');

//     closeVideoCall();
//     sendToServer({
//         name: myUsername,
//         target: targetUsername,
//         type: 'hang-up'
//     });
// }

// function closeVideoCall() {
//     console.log('closeVideoCall start');

//     var remoteVideo = document.getElementById('received_video');
//     var localVideo = document.getElementById('local_video');

//     if (myPeerConnection) {
//         myPeerConnection.ontrack = null;
//         myPeerConnection.onremovetrack = null;
//         myPeerConnection.onicecandidate = null;
//         myPeerConnection.oniceconnectionstatechange = null;
//         myPeerConnection.onsignalingstatechange = null;
//         myPeerConnection.onicegatheringstatechange = null;
//     }

//     if (remoteVideo.srcObject) {
//         remoteVideo.srcObject.getTracks()
//         .forEach(track => track.stop());
//     }

//     if (localVideo.srcObject) {
//         localVideo.srcObject.getTracks()
//         .forEach(track => track.stop());
//     }

//     myPeerConnection.close();
//     myPeerConnection = null;

//     remoteVideo.removeAttribute('src');
//     remoteVideo.removeAttribute('srcObject');
//     localVideo.removeAttribute('src');
//     localVideo.removeAttribute('srcObject');

//     document.getElementById('hangup-button').disabled = true;
//     targetUsername = null;
// }

// function handleIceConnectionStateChangeEvent(event) {
//     console.log('handleIceConnectionStateChangeEvent start');

//     switch(myPeerConnection.iceConnectionState) {
//         case "closed":
//         case "failed":
//         case "disconnected":
//             closeVideoCall();
//             break;
//     }
// }

// function handleSignalingStateChangeEvent(event) {
//     console.log('handleSignalingStateChangeEvent start', event);

//     switch(myPeerConnection.signalingState) {
//         case "closed":
//             closeVideoCall();
//             break;
//     }
// }