import React, { useState, useEffect, useRef } from 'react';
import { Baby, Trash2, CloudLightning, Sun, CloudRain, Activity, Check } from 'lucide-react';
import { onValue, ref } from 'firebase/database';
import { db } from './firebase';

export default function App() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertMessage, setAlertMessage] = useState('');
  const previousMoistureRef = useRef(0);
  const callMadeRef = useRef(false);

  const DIPPER_COLLECTION = import.meta.env.VITE_DIPPER_COLLECTION || 'dipper';
  const DIPPER_DOC_ID = import.meta.env.VITE_DIPPER_DOC_ID || '918791752379';
  const MOISTURE_FIELD = import.meta.env.VITE_DIPPER_MOISTURE_FIELD || 'moisture';

  // 1. Start once Firebase is available
  useEffect(() => {
    if (!db) {
      setError('Firebase is not configured. Check your .env values, especially VITE_FIREBASE_DATABASE_URL.');
      setLoading(false);
      return;
    }

    setLoading(false);
  }, []);

  // 2. Fetch Real-time Data from Realtime Database path dipper/{docId}/moisture
  useEffect(() => {
    if (!db) return;

    // Listen at the collection root and handle several possible shapes:
    // - dipper: 12
    // - dipper: { moisture: 12 }
    // - dipper: { 91879...: { moisture: 12 } }
    const rootPath = `${DIPPER_COLLECTION}`;
    console.debug('Listening to Realtime DB at', rootPath);
    const rootRef = ref(db, rootPath);
    const unsubscribe = onValue(
      rootRef,
      (snapshot) => {
        const data = snapshot.val();
        console.debug('Realtime root snapshot received:', data);

        let rawVal = null;
        if (data == null) {
          rawVal = null;
        } else if (typeof data === 'number' || typeof data === 'string') {
          rawVal = data;
        } else if (MOISTURE_FIELD in data && (typeof data[MOISTURE_FIELD] !== 'undefined')) {
          rawVal = data[MOISTURE_FIELD];
        } else if (DIPPER_DOC_ID in data && data[DIPPER_DOC_ID] && (MOISTURE_FIELD in data[DIPPER_DOC_ID])) {
          rawVal = data[DIPPER_DOC_ID][MOISTURE_FIELD];
        } else {
          // try to find a child object that has the moisture field
          const firstChild = Object.values(data).find((v) => v && typeof v === 'object' && (MOISTURE_FIELD in v));
          if (firstChild) rawVal = firstChild[MOISTURE_FIELD];
        }

        console.debug('Resolved raw moisture value:', rawVal);
        const value = Number.isFinite(Number(rawVal)) ? Math.max(0, Math.min(100, Number(rawVal))) : 0;

        const incomingLog = {
          id: `${DIPPER_COLLECTION}-${DIPPER_DOC_ID}-moisture-${Date.now()}`,
          value: Number.isFinite(value) ? value : null,
          timestamp: Date.now(),
        };

        setLogs((currentLogs) => {
          const next = [incomingLog, ...currentLogs].slice(0, 50);
          return next;
        });
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Realtime Database Error:', err);
        setError('Realtime DB connection error.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [DIPPER_COLLECTION, DIPPER_DOC_ID, MOISTURE_FIELD]);

  // 3. Raise website alert when moisture > 70%
  useEffect(() => {
    const currentMoisture = logs.length > 0 ? logs[0].value : 0;
    const wasAboveThreshold = previousMoistureRef.current > 70;
    const isAboveThreshold = currentMoisture > 70;

    if (isAboveThreshold) {
      setAlertMessage(`Alert: Moisture is high (${currentMoisture}%). Please change diaper.`);
    } else {
      setAlertMessage('');
    }

    if (!wasAboveThreshold && isAboveThreshold) {
      setError(`High moisture detected: ${currentMoisture}%`);
      if (!callMadeRef.current) {
        callMadeRef.current = true;
        callCaregiver();
      }
    }

    if (wasAboveThreshold && !isAboveThreshold) {
      callMadeRef.current = false;
    }

    previousMoistureRef.current = currentMoisture;
  }, [logs]);

  const clearData = async () => {
    setLogs([]);
  };

  const [callLoading, setCallLoading] = useState(false);
  const [callResult, setCallResult] = useState('');

  const callCaregiver = async () => {
    try {
      setCallLoading(true);
      setCallResult('');
      const alertCallUrl = import.meta.env.VITE_ALERT_CALL_URL || 'http://localhost:3002/api/alert-call';
      const body = { moisture: currentMoisture, message: alertMessage || undefined };
      const resp = await fetch(alertCallUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = data?.detail || data?.error || `Request failed: ${resp.status}`;
        setCallResult(`Error: ${msg}`);
        setError(`Failed to call caregiver: ${msg}`);
        return;
      }
      setCallResult('Call initiated');
    } catch (err) {
      console.error('Call failed', err);
      setCallResult('Error initiating call');
      setError('Error initiating call');
    } finally {
      setCallLoading(false);
      setTimeout(() => setCallResult(''), 5000);
    }
  };

  const currentMoisture = logs.length > 0 ? logs[0].value : 0;


  // UI Personality Theme Logic (Lovable Mascot)

  const getPersonality = (value) => {
    if (value < 30) return { 
      state: 'happy',
      message: "I'm dry and happy!",
      bgGradient: 'from-amber-200 via-orange-100 to-rose-100',
      cloudColor: 'bg-white',
      shadow: 'shadow-[0_20px_60px_rgba(251,191,36,0.3)]',
      weather: <Sun className="w-12 h-12 text-amber-400 animate-spin-slow" />,
      textColor: 'text-amber-700',
      btnColor: 'bg-amber-400 hover:bg-amber-500'
    };
    if (value < 70) return { 
      state: 'worried',
      message: "Feeling a bit squishy...",
      bgGradient: 'from-indigo-200 via-purple-100 to-pink-100',
      cloudColor: 'bg-indigo-50',
      shadow: 'shadow-[0_20px_60px_rgba(99,102,241,0.3)]',
      weather: <CloudRain className="w-12 h-12 text-indigo-400 animate-bounce" />,
      textColor: 'text-indigo-700',
      btnColor: 'bg-indigo-400 hover:bg-indigo-500'
    };
    return { 
      state: 'crying',
      message: "Wahh! Change me please!",
      bgGradient: 'from-slate-700 via-slate-600 to-indigo-900',
      cloudColor: 'bg-slate-300',
      shadow: 'shadow-[0_20px_60px_rgba(0,0,0,0.5)]',
      weather: <CloudLightning className="w-12 h-12 text-yellow-400 animate-pulse" />,
      textColor: 'text-white',
      btnColor: 'bg-rose-500 hover:bg-rose-600'
    };
  };

  const p = getPersonality(currentMoisture);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-rose-50">
        <div className="animate-bounce p-8 bg-white rounded-full shadow-2xl">
          <Baby className="w-16 h-16 text-rose-400" />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-all duration-1000 ease-in-out bg-gradient-to-br ${p.bgGradient} font-sans flex flex-col items-center justify-center overflow-hidden relative`}>
      {alertMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-rose-600 text-white font-bold px-5 py-3 rounded-2xl shadow-xl border-2 border-rose-300 animate-pulse">
          {alertMessage}
        </div>
      )}

      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-slate-900/80 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {error}
        </div>
      )}

      {/* Background Weather Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        {p.state === 'crying' && (
          <div className="absolute inset-0 rain-bg"></div>
        )}
        {p.state === 'happy' && (
          <div className="absolute top-10 left-10 w-64 h-64 bg-yellow-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-pulse"></div>
        )}
      </div>

      {/* Main Single-Page Container */}
      <div className="w-full max-w-4xl px-4 flex flex-col md:flex-row items-center justify-center gap-10 md:gap-20 z-10 h-[90vh] md:h-auto">
        
        {/* LEFT: The Lovable Mascot */}
        <div className="flex flex-col items-center justify-center w-full md:w-1/2 relative group">
          
          {/* Weather Icon Floating Above */}
          <div className="absolute -top-12 md:-top-16 z-0 drop-shadow-xl">
            {p.weather}
          </div>

          {/* The Mascot Body (Squishy Cloud Blob) */}
          <div className={`relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 ${p.cloudColor} rounded-[45%] animate-squish ${p.shadow} flex items-center justify-center transition-colors duration-1000 border-8 border-white/40 backdrop-blur-sm z-10`}>
            
            {/* Mascot Face */}
            <div className="relative w-full h-full flex flex-col items-center justify-center -mt-6">
              
              {/* Eyes */}
              <div className="flex gap-12 sm:gap-16 items-end">
                {/* Left Eye */}
                <div className={`w-6 h-6 sm:w-8 sm:h-8 bg-slate-800 rounded-full transition-all duration-300 ${p.state === 'happy' ? 'animate-blink' : p.state === 'crying' ? 'h-2 sm:h-2 mt-4' : 'animate-look-around'}`}></div>
                {/* Right Eye */}
                <div className={`w-6 h-6 sm:w-8 sm:h-8 bg-slate-800 rounded-full transition-all duration-300 ${p.state === 'happy' ? 'animate-blink' : p.state === 'crying' ? 'h-2 sm:h-2 mt-4' : 'animate-look-around'}`}></div>
              </div>

              {/* Rosy Cheeks */}
              <div className="absolute top-[45%] flex w-full justify-center gap-24 sm:gap-32 px-10 opacity-60">
                <div className={`w-8 h-4 sm:w-12 sm:h-6 rounded-full blur-sm transition-colors duration-500 ${p.state === 'happy' ? 'bg-rose-400' : 'bg-slate-300'}`}></div>
                <div className={`w-8 h-4 sm:w-12 sm:h-6 rounded-full blur-sm transition-colors duration-500 ${p.state === 'happy' ? 'bg-rose-400' : 'bg-slate-300'}`}></div>
              </div>

              {/* Mouth */}
              <div className="mt-4 sm:mt-6">
                {p.state === 'happy' && (
                  <div className="w-12 h-6 sm:w-16 sm:h-8 border-b-8 border-slate-800 rounded-b-full transition-all duration-500"></div>
                )}
                {p.state === 'worried' && (
                  <div className="w-8 h-3 sm:w-10 sm:h-4 bg-slate-800 rounded-full transition-all duration-500 animate-pulse"></div>
                )}
                {p.state === 'crying' && (
                  <div className="w-12 h-8 sm:w-16 sm:h-12 border-t-8 border-slate-800 rounded-t-full transition-all duration-500 mt-2 relative">
                     <div className="absolute -left-8 top-10 w-3 h-5 sm:w-4 sm:h-6 bg-blue-400 rounded-full animate-tear drop-shadow-md"></div>
                     <div className="absolute -right-8 top-14 w-3 h-5 sm:w-4 sm:h-6 bg-blue-400 rounded-full animate-tear delay-150 drop-shadow-md"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Moisture Percentage Badge */}
            <div className={`absolute -bottom-6 sm:-bottom-8 px-6 sm:px-8 py-3 sm:py-4 rounded-[2rem] shadow-xl border-4 flex items-center gap-2 transform group-hover:scale-110 transition-transform ${p.state === 'crying' ? 'bg-rose-700 border-rose-700' : 'bg-white border-white'}`}>
              <Activity className={`w-5 h-5 sm:w-6 sm:h-6 ${p.state === 'crying' ? 'text-white' : 'text-blue-400'}`} />
              <span className={`text-2xl sm:text-4xl font-black ${p.state === 'crying' ? 'text-white' : p.textColor} tracking-tight`}>{currentMoisture}%</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Bubbly Interaction Dock */}
        <div className="flex flex-col w-full md:w-1/2 gap-4 sm:gap-6 max-w-sm mx-auto md:mx-0">
          
          {/* Conversational Status Bubble */}
          <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 sm:p-8 shadow-xl relative w-full border-2 border-white">
            {/* Speech bubble pointer */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white/80 rotate-45 border-l-2 border-b-2 border-white hidden md:block"></div>
            
            <h1 className={`text-2xl sm:text-3xl font-black ${p.textColor} mb-2 leading-tight`}>
              {p.message}
            </h1>
            <p className="text-slate-500 font-medium text-sm sm:text-base">
              {p.state === 'happy' ? 'Everything looks perfect. Enjoy the playtime!' : 
               p.state === 'worried' ? 'Might want to check the diaper soon.' : 
               'Time for a fresh change immediately!'}
            </p>
          </div>

          {/* Controls - Bubbly Buttons */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <button
              onClick={clearData}
              className="flex items-center justify-center gap-2 sm:gap-3 py-4 sm:py-5 rounded-[1.5rem] sm:rounded-[2rem] font-bold text-slate-500 bg-white shadow-lg hover:bg-slate-50 transition-all hover:-translate-y-1 active:scale-95"
            >
              <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
              Reset Logs
            </button>
            <button
              onClick={callCaregiver}
              disabled={callLoading}
              className={`flex items-center justify-center gap-2 sm:gap-3 py-4 sm:py-5 rounded-[1.5rem] sm:rounded-[2rem] font-bold text-white shadow-lg transition-all active:scale-95 ${p.btnColor} ${callLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <CloudLightning className="w-5 h-5 sm:w-6 sm:h-6" />
              {callLoading ? 'Calling...' : 'Call Caregiver'}
            </button>
          </div>

          {callResult && (
            <div className="mt-3 text-sm font-semibold text-center text-slate-700">{callResult}</div>
          )}

          {/* Mini Memory Log (Replaces boring timeline) */}
          <div className="bg-white/60 backdrop-blur-md rounded-[2rem] p-5 sm:p-6 shadow-lg border border-white h-[180px] sm:h-[220px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold text-slate-700 text-sm sm:text-base">Recent Memories</span>
              {logs.length > 0 && <span className="bg-white px-3 py-1 rounded-full text-xs font-bold text-blue-500 shadow-sm">{logs.length} Updates</span>}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll space-y-2 sm:space-y-3 pr-2">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col justify-center items-center opacity-50 text-slate-500">
                  <Baby className="w-8 h-8 sm:w-10 sm:h-10 mb-2" />
                  <p className="text-xs sm:text-sm font-bold text-center">Waiting for sensor data...</p>
                </div>
              ) : (
                logs.map((log) => {
                  const logTheme = getPersonality(log.value);
                  const logTextClass = logTheme.state === 'crying' ? 'text-rose-700' : logTheme.textColor;
                  return (
                    <div key={log.id} className="bg-white p-3 sm:p-4 rounded-[1.2rem] shadow-sm flex items-center gap-3 sm:gap-4 hover:scale-[1.02] transition-transform">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-inner ${logTheme.cloudColor}`}>
                        {logTheme.state === 'happy' ? <Check className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" /> : 
                         logTheme.state === 'crying' ? <CloudLightning className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" /> : 
                         <CloudRain className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />}
                      </div>
                      <div className="flex-1 flex justify-between items-center">
                        <div>
                          <p className={`font-black text-sm sm:text-lg ${logTextClass}`}>
                            {Number.isFinite(log.value) ? `${log.value}%` : '—'}
                          </p>
                        </div>
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
      
      {/* Required CSS for the Lovable Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes squish {
          0%, 100% { transform: scale(1, 1); border-radius: 45%; }
          50% { transform: scale(1.05, 0.95); border-radius: 50% 50% 40% 40%; }
        }
        .animate-squish {
          animation: squish 4s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }
        .animate-blink {
          animation: blink 4s infinite;
        }

        @keyframes lookAround {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-look-around {
          animation: lookAround 3s infinite ease-in-out;
        }

        @keyframes tearDrop {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(40px) scale(0.5); opacity: 0; }
        }
        .animate-tear {
          animation: tearDrop 1s infinite linear;
        }

        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }

        /* Rain background effect for Wet state */
        .rain-bg {
          background-image: linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 100%);
          background-size: 20px 20px;
          animation: rainFall 0.5s linear infinite;
        }
        @keyframes rainFall {
          0% { background-position: 0 0; }
          100% { background-position: 10px 100px; }
        }

        /* Invisible but functional scrollbar */
        .custom-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(203, 213, 225, 0.5);
          border-radius: 10px;
        }
        .custom-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.8);
        }
      `}} />
    </div>
  );
}