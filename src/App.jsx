import React, { useState, useEffect, useRef } from "react";

function App() {
  const [config, setConfig] = useState({
    confidenceThreshold: 80,
    mode: "Auto",
    language: "Français",
    streamMethod: "WebSocket", // Nouvelle option pour choisir la méthode
  });

  const [history, setHistory] = useState([]);
  const [imageSrc, setImageSrc] = useState(
    "https://via.placeholder.com/800x600.png?text=Upload+an+Image"
  );
  const [results, setResults] = useState({
    description: "",
  });
  const [activeTab, setActiveTab] = useState("Results");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const websocketRef = useRef(null);
  const pcRef = useRef(null);
  const videoRef = useRef(null);
  const currentFrameRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(null);

  useEffect(() => {
    if (isWebcamActive) {
      if (config.streamMethod === "WebSocket") {
        // Connexion WebSocket
        websocketRef.current = new WebSocket("ws://localhost:8000/ws/webcam");

        websocketRef.current.onopen = () => {
          console.log("Connexion WebSocket établie");
          const time = new Date().toLocaleTimeString();
          setHistory((prev) => [...prev, `[${time}] Connexion WebSocket établie`]);
          frameCountRef.current = 0;
          lastFrameTimeRef.current = performance.now();
        };

        websocketRef.current.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log("Données WebSocket reçues:", data);
          if (data.error) {
            console.error("Erreur WebSocket:", data.error);
            setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Erreur: ${data.error}`]);
            stopWebcam();
          } else if (data.frame && data.frame.startsWith("data:image/jpeg;base64,")) {
            setImageSrc(data.frame);
            currentFrameRef.current = data.frame;
            frameCountRef.current += 1;
            const now = performance.now();
            if (now - lastFrameTimeRef.current >= 1000) {
              const fps = frameCountRef.current / ((now - lastFrameTimeRef.current) / 1000);
              setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] FPS WebSocket: ${fps.toFixed(2)}`]);
              frameCountRef.current = 0;
              lastFrameTimeRef.current = now;
            }
          } else {
            console.error("Frame invalide ou manquant");
            setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Erreur: Frame invalide ou manquant`]);
          }
        };

        websocketRef.current.onclose = () => {
          console.log("Connexion WebSocket fermée");
          setIsWebcamActive(false);
          setImageSrc("https://via.placeholder.com/800x600.png?text=Webcam+Disconnected");
          const time = new Date().toLocaleTimeString();
          setHistory((prev) => [...prev, `[${time}] WebSocket déconnecté`]);
        };

        websocketRef.current.onerror = (error) => {
          console.error("Erreur WebSocket:", error);
          setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Erreur WebSocket`]);
          stopWebcam();
        };
      } else if (config.streamMethod === "WebRTC") {
        // Connexion WebRTC
        pcRef.current = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        websocketRef.current = new WebSocket("ws://localhost:8000/webrtc");

        websocketRef.current.onopen = () => {
          console.log("Connexion WebSocket (WebRTC) établie");
          const time = new Date().toLocaleTimeString();
          setHistory((prev) => [...prev, `[${time}] Connexion WebRTC établie`]);
          frameCountRef.current = 0;
          lastFrameTimeRef.current = performance.now();
        };

        websocketRef.current.onmessage = async (event) => {
          const message = JSON.parse(event.data);
          console.log("Message WebSocket (WebRTC) reçu:", message);

          if (message.type === "answer") {
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription({ sdp: message.sdp, type: "answer" })
            );
          } else if (message.type === "candidate") {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(message.candidate));
          }
        };

        websocketRef.current.onclose = () => {
          console.log("Connexion WebSocket (WebRTC) fermée");
          setIsWebcamActive(false);
          if (videoRef.current) {
            videoRef.current.srcObject = null;
          }
          const time = new Date().toLocaleTimeString();
          setHistory((prev) => [...prev, `[${time}] WebRTC déconnecté`]);
        };

        websocketRef.current.onerror = (error) => {
          console.error("Erreur WebSocket (WebRTC):", error);
          setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Erreur WebRTC`]);
          stopWebcam();
        };

        pcRef.current.ontrack = (event) => {
          if (event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            videoRef.current.play();
          }
        };

        pcRef.current.onicecandidate = (event) => {
          if (event.candidate) {
            websocketRef.current.send(JSON.stringify({
              type: "candidate",
              candidate: event.candidate,
            }));
          }
        };

        // Créer une offre SDP
        const offer = async () => {
          const offerDesc = await pcRef.current.createOffer();
          await pcRef.current.setLocalDescription(offerDesc);
          websocketRef.current.send(JSON.stringify({
            type: "offer",
            sdp: offerDesc.sdp,
          }));
        };

        offer();

        // Capturer des frames pour l'analyse et calculer les FPS
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const captureFrame = () => {
          if (videoRef.current && videoRef.current.videoWidth) {
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            currentFrameRef.current = canvas.toDataURL("image/jpeg");
            frameCountRef.current += 1;
            const now = performance.now();
            if (now - lastFrameTimeRef.current >= 1000) {
              const fps = frameCountRef.current / ((now - lastFrameTimeRef.current) / 1000);
              setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] FPS WebRTC: ${fps.toFixed(2)}`]);
              frameCountRef.current = 0;
              lastFrameTimeRef.current = now;
            }
          }
          if (isWebcamActive && config.streamMethod === "WebRTC") {
            requestAnimationFrame(captureFrame);
          }
        };

        captureFrame();
      }
    }

    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, [isWebcamActive, config.streamMethod]);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        if (config.streamMethod === "WebSocket") {
          setImageSrc(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    let fileToUpload = selectedFile;

    if (isWebcamActive && currentFrameRef.current) {
      const response = await fetch(currentFrameRef.current);
      const blob = await response.blob();
      fileToUpload = new File([blob], "webcam_frame.jpg", { type: "image/jpeg" });
    }

    if (!fileToUpload) {
      setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Erreur: Aucune image sélectionnée`]);
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", fileToUpload);

    try {
      const uploadRes = await fetch("http://localhost:8000/upload-image/", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (uploadData.message) {
        throw new Error(uploadData.message);
      }
      const filename = uploadData.filename;

      const analyzeRes = await fetch(`http://localhost:8000/analyze/${filename}`);
      const analysisData = await analyzeRes.json();

      setResults({
        description: analysisData.description,
      });

      const time = new Date().toLocaleTimeString();
      setHistory((prev) => [...prev, `[${time}] Analyse effectuée`]);
    } catch (error) {
      console.error("Erreur :", error);
      setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Erreur lors de l'analyse: ${error.message}`]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setImageSrc("https://via.placeholder.com/800x600.png?text=Upload+an+Image");
    setResults({ description: "" });
    setSelectedFile(null);
    setIsLoading(false);
    stopWebcam();
    const time = new Date().toLocaleTimeString();
    setHistory((prev) => [...prev, `[${time}] Réinitialisation effectuée`]);
  };

  const startWebcam = () => {
    setIsWebcamActive(true);
    const time = new Date().toLocaleTimeString();
    setHistory((prev) => [...prev, `[${time}] ${config.streamMethod} démarré`]);
  };

  const stopWebcam = () => {
    if (websocketRef.current) {
      websocketRef.current.close();
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    setIsWebcamActive(false);
    setImageSrc("https://via.placeholder.com/800x600.png?text=Webcam+Disconnected");
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "Results":
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">Analyse de la Scène</h3>
            <div>
              <h4 className="font-medium">Description</h4>
              <p>{results.description || "Aucune description disponible."}</p>
            </div>
          </div>
        );
      case "Paramètres":
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">Paramètres</h3>
            
            <div className="mb-4">
              <label className="block text-sm mb-1">Langue</label>
              <select
                value={config.language}
                onChange={(e) =>
                  setConfig({ ...config, language: e.target.value })
                }
                className="w-full px-2 py-1 rounded bg-gray-700 text-white"
              >
                <option>Français</option>
                <option>Anglais</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm mb-1">Méthode de streaming</label>
              <select
                value={config.streamMethod}
                onChange={(e) => {
                  stopWebcam(); // Arrêter la connexion actuelle avant de changer
                  setConfig({ ...config, streamMethod: e.target.value });
                }}
                className="w-full px-2 py-1 rounded bg-gray-700 text-white"
              >
                <option>WebSocket</option>
                <option>WebRTC</option>
              </select>
            </div>
            <div className="mt-6">
              <h4 className="font-medium mb-2">Serveur</h4>
              <p>
                État du serveur :{" "}
                <span className="text-green-400">En ligne</span>
              </p>
              <p>Adresse : localhost:5173</p>
            </div>
          </div>
        );
      case "Journal":
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">Journal</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {history.length > 0 ? (
                history.map((entry, index) => <li key={index}>{entry}</li>)
              ) : (
                <li>Aucune activité enregistrée.</li>
              )}
            </ul>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <nav className="flex justify-between items-center bg-gray-800 p-4">
        <div className="text-lg font-bold">ImagoIQ</div>
      </nav>

      <div className="flex flex-1">
        <div className="w-38 bg-gray-800 p-4">
          <ul className="space-y-4">
            <li className="relative group">
              <button
                onClick={handleUpload}
                className={`w-full p-2 rounded cursor-pointer flex justify-center items-center ${
                  isLoading ? "bg-gray-600 opacity-50" : "bg-green-600 hover:bg-green-700"
                }`}
                disabled={isLoading}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M5 3l12 7-12 7V3z" />
                </svg>
              </button>
              <span className="absolute left-full ml-2 hidden group-hover:block bg-gray-700 text-white text-xs rounded py-1 px-2">
                Analyser
              </span>
            </li>
            <li className="relative group">
              <button
                onClick={isWebcamActive ? stopWebcam : startWebcam}
                className={`w-full p-2 rounded cursor-pointer flex justify-center items-center ${
                  isWebcamActive ? "bg-yellow-600 hover:bg-yellow-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 110-12 6 6 0 010 12zm-1-5a1 1 0 112 0v3a1 1 0 11-2 0v-3zm0-4a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
              <span className="absolute left-full ml-2 hidden group-hover:block bg-gray-700 text-white text-xs rounded py-1 px-2">
                {isWebcamActive ? "Arrêter Webcam" : "Démarrer Webcam"}
              </span>
            </li>
            <li className="relative group">
              <button
                onClick={handleReset}
                className="w-full p-2 rounded cursor-pointer flex justify-center items-center bg-red-600 hover:bg-red-700"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <span className="absolute left-full ml-2 hidden group-hover:block bg-gray-700 text-white text-xs rounded py-1 px-2">
                Réinitialiser
              </span>
            </li>
            <li className="relative group">
              <div
                onClick={() => setActiveTab("Results")}
                className={`w-full p-2 rounded cursor-pointer flex justify-center items-center ${
                  activeTab === "Results" ? "bg-gray-600" : "hover:bg-gray-600"
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" />
                </svg>
              </div>
              <span className="absolute left-full ml-2 hidden group-hover:block bg-gray-700 text-white text-xs rounded py-1 px-2">
                Résultats
              </span>
            </li>
            <li className="relative group">
              <div
                onClick={() => setActiveTab("Paramètres")}
                className={`w-full p-2 rounded cursor-pointer flex justify-center items-center ${
                  activeTab === "Paramètres" ? "bg-gray-600" : "hover:bg-gray-600"
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l-.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319z" />
                  <path
                    fill="#374151"
                    d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"
                  />
                </svg>
              </div>
              <span className="absolute left-full ml-2 hidden group-hover:block bg-gray-700 text-white text-xs rounded py-1 px-2">
                Paramètres
              </span>
            </li>
            <li className="relative group">
              <div
                onClick={() => setActiveTab("Journal")}
                className={`w-full p-2 rounded cursor-pointer flex justify-center items-center ${
                  activeTab === "Journal" ? "bg-gray-600" : "hover:bg-gray-600"
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm-2 4h12v2H4V6zm0 4h12v6H4v-6z" />
                </svg>
              </div>
              <span className="absolute left-full ml-2 hidden group-hover:block bg-gray-700 text-white text-xs rounded py-1 px-2">
                Journal
              </span>
            </li>
          </ul>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center bg-gray-600 p-4">
          <div className="mb-4 flex space-x-4">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
          </div>

          <div className="w-full h-full flex justify-center items-center relative">
            {config.streamMethod === "WebSocket" ? (
              <img
                src={imageSrc}
                alt="Scène"
                className="max-w-full max-h-[80vh] object-contain"
                key={imageSrc}
                onError={() => {
                  console.error("Erreur de chargement de l'image");
                  setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Erreur: Impossible de charger l'image`]);
                }}
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="max-w-full max-h-[80vh] object-contain"
                onError={() => {
                  console.error("Erreur de chargement du flux vidéo");
                  setHistory((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Erreur: Impossible de charger le flux vidéo`]);
                }}
              />
            )}
            {isLoading && (
              <div className="absolute inset-0 flex flex-col justify-center items-center bg-black bg-opacity-50 space-y-2">
                <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                <div className="text-white text-sm mt-2">
                  Analyse en cours...
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-80 bg-gray-800 p-4 overflow-y-auto">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}

export default App;