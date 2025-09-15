<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Touch Typing Finger Tracker</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      text-align: center;
      background: #f5f5f5;
      margin: 0;
      padding: 20px;
    }
    h1 { color: #333; }
    video {
      border: 2px solid #333;
      border-radius: 8px;
      margin: 20px 0;
      max-width: 90%;
    }
    #status {
      font-size: 1.2em;
      margin-top: 15px;
      padding: 10px;
      border-radius: 5px;
      display: inline-block;
      background: #eee;
    }
  </style>
</head>
<body>
  <h1>Touch Typing Finger Tracker (Prototype)</h1>
  <video id="video" autoplay playsinline></video>
  <div id="status">Press <b>F</b> or <b>J</b> to test</div>

  <!-- MediaPipe Hands -->
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>

  <script>
    const videoElement = document.getElementById('video');
    const statusEl = document.getElementById('status');

    // Initialize MediaPipe Hands
    const hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
    });

    hands.onResults((results) => {
      // For prototype, we’ll just detect if any hand is visible
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        statusEl.innerHTML = "👋 Hands detected. Press F or J.";
        statusEl.style.background = "#dff0d8";
      } else {
        statusEl.innerHTML = "No hands detected";
        statusEl.style.background = "#f2dede";
      }
    });

    // Camera setup
    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({image: videoElement});
      },
      width: 640,
      height: 480
    });
    camera.start();

    // Keyboard listener
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'f') {
        statusEl.innerHTML = "Key <b>F</b> pressed (should be LEFT INDEX)";
      }
      if (e.key.toLowerCase() === 'j') {
        statusEl.innerHTML = "Key <b>J</b> pressed (should be RIGHT INDEX)";
      }
    });
  </script>
</body>
</html>
