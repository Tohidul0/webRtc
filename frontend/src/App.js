import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { io } from 'socket.io-client';
import { FaVideo, FaVideoSlash, FaMicrophone, FaMicrophoneSlash } from 'react-icons/fa';

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #1a1a1a;
  color: white;
`;

const VideoContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 1200px;
  padding: 20px;
`;

const Video = styled.video`
  width: 100%;
  max-width: 600px;
  border-radius: 10px;
  background-color: #2a2a2a;
  ${props => props.isLocal ? 'transform: scaleX(-1);' : ''}
`;

const Controls = styled.div`
  display: flex;
  gap: 20px;
  margin-top: 20px;
`;

const Button = styled.button`
  padding: 10px 20px;
  border-radius: 5px;
  border: none;
  background-color: #4a4a4a;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  &:hover {
    background-color: #5a5a5a;
  }
`;

const RoomInput = styled.div`
  margin-bottom: 20px;
  display: flex;
  gap: 10px;
`;

const Input = styled.input`
  padding: 10px;
  border-radius: 5px;
  border: none;
  background-color: #2a2a2a;
  color: white;
`;

const ErrorMessage = styled.div`
  color: #ff4444;
  background-color: rgba(255, 68, 68, 0.1);
  padding: 10px 20px;
  border-radius: 5px;
  margin-bottom: 20px;
  text-align: center;
  max-width: 600px;
`;

const RoomStatus = styled.div`
  color: ${props => 
    props.status === 'disconnected' ? '#ff4444' : 
    props.status === 'connected' ? '#ffbb33' : 
    '#00C851'};
  margin-bottom: 10px;
  font-weight: bold;
`;

function App() {
  const [roomId, setRoomId] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const localVideoRef = useRef();
  const socketRef = useRef();
  const peerConnections = useRef({});
  const [error, setError] = useState(null);
  const [roomStatus, setRoomStatus] = useState('disconnected');

  useEffect(() => {
    socketRef.current = io('http://localhost:3000');

    socketRef.current.on('connect', () => {
      console.log('Connected to signaling server');
      setRoomStatus('connected');
    });

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      setRoomStatus('disconnected');
    });

    socketRef.current.on('peers-list', ({ peers }) => {
      console.log('Peers in room:', peers);
      peers.forEach(peerId => {
        createPeerConnection(peerId);
      });
      setRoomStatus('joined');
    });

    socketRef.current.on('signal', async ({ from, data }) => {
      const peerConnection = peerConnections.current[from];
      if (!peerConnection) return;

      try {
        if (data.offer) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socketRef.current.emit('signal', {
            to: from,
            data: { answer: peerConnection.localDescription }
          });
        } else if (data.answer) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.candidate) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error('Error handling signal:', error);
      }
    });

    socketRef.current.on('peer-disconnected', ({ peerId }) => {
      if (peerConnections.current[peerId]) {
        peerConnections.current[peerId].close();
        delete peerConnections.current[peerId];
        setRemoteStreams(prev => {
          const newStreams = { ...prev };
          delete newStreams[peerId];
          return newStreams;
        });
      }
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const createPeerConnection = async (peerId) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    // Add local tracks to the connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind);
        peerConnection.addTrack(track, localStream);
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        socketRef.current.emit('signal', {
          to: peerId,
          data: { candidate: event.candidate }
        });
      }
    };

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      console.log('Received track from peer:', peerId);
      setRemoteStreams(prev => ({
        ...prev,
        [peerId]: event.streams[0]
      }));
    };

    // Create and send offer if we're the initiator
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      socketRef.current.emit('signal', {
        to: peerId,
        data: { offer: peerConnection.localDescription }
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }

    // Handle incoming signals
    peerConnection.onsignalingstatechange = () => {
      console.log('Signaling state:', peerConnection.signalingState);
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
    };

    peerConnections.current[peerId] = peerConnection;
  };

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setError(null);
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setError('Could not access camera or microphone. Please make sure you have granted the necessary permissions and that your camera/microphone is not being used by another application.');
    }
  };

  const joinRoom = () => {
    if (roomId) {
      socketRef.current.emit('join-room', roomId);
      startLocalStream();
    } else {
      setError('Please enter a room ID');
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOn(!isVideoOn);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(!isAudioOn);
      }
    }
  };

  return (
    <AppContainer>
      {error && (
        <ErrorMessage>
          {error}
        </ErrorMessage>
      )}
      <RoomStatus status={roomStatus}>
        Status: {roomStatus === 'disconnected' ? 'Not Connected' : 
                roomStatus === 'connected' ? 'Connected to Server' : 
                'Joined Room'}
      </RoomStatus>
      <RoomInput>
        <Input
          type="text"
          placeholder="Enter Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <Button onClick={joinRoom} disabled={roomStatus === 'joined'}>
          {roomStatus === 'joined' ? 'In Room' : 'Join Room'}
        </Button>
      </RoomInput>

      <VideoContainer>
        <Video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted={true}
          isLocal={true}
        />
        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <Video
            key={peerId}
            autoPlay
            playsInline
            muted={false}
            ref={video => {
              if (video) {
                video.srcObject = stream;
                // Ensure audio is enabled for remote streams
                if (stream.getAudioTracks().length > 0) {
                  stream.getAudioTracks()[0].enabled = true;
                }
              }
            }}
          />
        ))}
      </VideoContainer>

      <Controls>
        <Button onClick={toggleVideo}>
          {isVideoOn ? <FaVideo /> : <FaVideoSlash />}
          {isVideoOn ? 'Turn Off Video' : 'Turn On Video'}
        </Button>
        <Button onClick={toggleAudio}>
          {isAudioOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
          {isAudioOn ? 'Mute' : 'Unmute'}
        </Button>
      </Controls>
    </AppContainer>
  );
}

export default App; 