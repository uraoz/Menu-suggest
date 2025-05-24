// src/main.js - 最新 @google/genai SDK統合版

// 最新Google Gen AI SDK をインポート
import { GoogleGenAI } from '@google/genai';

// 環境変数の取得と検証
const CONFIG = {
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY,
  appTitle: import.meta.env.VITE_APP_TITLE || 'レストラン推薦アプリ',
  defaultLat: parseFloat(import.meta.env.VITE_DEFAULT_LAT) || 35.6812,
  defaultLng: parseFloat(import.meta.env.VITE_DEFAULT_LNG) || 139.7671,
  isDevelopment: import.meta.env.DEV,
  apiTimeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 30000
};

// Gemini AI の初期化
let ai = null;

function initializeGeminiAI() {
  try {
    if (!CONFIG.geminiApiKey || CONFIG.geminiApiKey === 'your_gemini_api_key_here') {
      debugLog('Gemini APIキーが設定されていません', 'warn');
      return false;
    }
    
    // 最新GoogleGenAI インスタンスを作成
    ai = new GoogleGenAI({
      apiKey: CONFIG.geminiApiKey
    });
    
    debugLog('最新Gemini AI SDK初期化完了 (gemini-2.0-flash)');
    return true;
  } catch (error) {
    debugLog(`Gemini AI SDK初期化エラー: ${error.message}`, 'error');
    return false;
  }
}

// グローバル変数
let map = null;
let geocoder = null;
let placesService = null;
let currentPosition = null;
let markers = [];
let restaurantMarkers = [];
let infoWindow = null;

// 検索状態管理
let searchState = {
  isSearching: false,
  lastSearchLocation: null,
  currentRadius: 1000,
  restaurantResults: [],
  detailsCache: new Map(),
  analysisCache: new Map()
};

// API使用量管理
let apiUsage = {
  nearbySearchCount: 0,
  placeDetailsCount: 0,
  geminiRequestCount: 0,
  resetTime: Date.now() + 24 * 60 * 60 * 1000
};

// デバッグ用のログ関数
function debugLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
  
  if (CONFIG.isDevelopment) {
    console.log(logMessage);
  }
  
  if (map) {
    updateDebugPanel();
  }
}

// ステータス表示の更新
function updateStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  
  debugLog(`Status: ${message}`, type);
  
  setTimeout(() => {
    if (type !== 'error') {
      statusEl.style.display = 'none';
    }
  }, 3000);
}

// デバッグパネルの更新
function updateDebugPanel() {
  if (!map) {
    return;
  }
  
  try {
    const center = map.getCenter();
    const elements = {
      'debug-api-status': CONFIG.googleMapsApiKey ? '設定済み' : '未設定',
      'debug-env': CONFIG.isDevelopment ? '開発環境' : '本番環境',
      'debug-coords': center ? 
        `${center.lat().toFixed(6)}, ${center.lng().toFixed(6)}` : 
        '未取得',
      'debug-zoom': map.getZoom() || '未取得',
      'debug-last-search': document.getElementById('debug-last-search')?.textContent || '-'
    };
    
    if (searchState.restaurantResults.length > 0) {
      elements['debug-restaurants'] = `${searchState.restaurantResults.length}件発見`;
    }
    
    elements['debug-api-usage'] = `検索:${apiUsage.nearbySearchCount} 詳細:${apiUsage.placeDetailsCount} AI:${apiUsage.geminiRequestCount}`;
    elements['debug-gemini-status'] = ai ? 'Gemini 2.0準備完了' : '未設定';
    
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      }
    });
  } catch (error) {
    debugLog(`デバッグパネル更新エラー: ${error.message}`, 'error');
  }
}

// API使用量の管理
function trackApiUsage(apiType) {
  const now = Date.now();
  
  if (now > apiUsage.resetTime) {
    apiUsage.nearbySearchCount = 0;
    apiUsage.placeDetailsCount = 0;
    apiUsage.geminiRequestCount = 0;
    apiUsage.resetTime = now + 24 * 60 * 60 * 1000;
    debugLog('API使用量カウンターをリセット');
  }
  
  if (apiType === 'nearbySearch') {
    apiUsage.nearbySearchCount++;
  } else if (apiType === 'placeDetails') {
    apiUsage.placeDetailsCount++;
  } else if (apiType === 'gemini') {
    apiUsage.geminiRequestCount++;
  }
  
  debugLog(`API使用量: ${apiType} - 合計: 検索${apiUsage.nearbySearchCount}回、詳細${apiUsage.placeDetailsCount}回、AI${apiUsage.geminiRequestCount}回`);
}

// Gemini AI呼び出し関数（最新SDK版）
async function callGeminiAI(prompt) {
  if (!ai) {
    throw new Error('Gemini AI が初期化されていません');
  }
  
  try {
    debugLog('Gemini AI呼び出し開始 (最新SDK版 - gemini-2.0-flash)');
    trackApiUsage('gemini');
    
    // 最新のAPIを使用してコンテンツ生成
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: prompt,
      config: {
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 1000,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      }
    });
    
    const text = response.text;
    
    if (!text || text.trim().length === 0) {
      throw new Error('AI応答が空です');
    }
    
    debugLog(`Gemini AI呼び出し成功 (${text.length}文字)`);
    return text;
    
  } catch (error) {
    debugLog(`Gemini AI呼び出しエラー: ${error.message}`, 'error');
    
    // 最新SDK特有のエラーハンドリング
    if (error.message.includes('API_KEY_INVALID') || error.message.includes('authentication')) {
      throw new Error('Gemini APIキーが無効です。正しいAPIキーを設定してください。');
    } else if (error.message.includes('QUOTA_EXCEEDED') || error.message.includes('quota')) {
      throw new Error('Gemini API使用量上限に達しました。時間をおいて再試行してください。');
    } else if (error.message.includes('SAFETY') || error.message.includes('safety')) {
      throw new Error('安全性フィルターによりコンテンツがブロックされました。');
    } else if (error.message.includes('RECITATION') || error.message.includes('recitation')) {
      throw new Error('生成されたコンテンツに引用の問題があります。');
    } else if (error.message.includes('RATE_LIMIT') || error.message.includes('rate')) {
      throw new Error('リクエスト頻度が制限を超えました。しばらく待ってから再試行してください。');
    }
    
    throw error;
  }
}

// ストリーミング版（デモンストレーション用）
async function callGeminiAIStream(prompt) {
  if (!ai) {
    throw new Error('Gemini AI が初期化されていません');
  }
  
  try {
    debugLog('Gemini AI ストリーミング呼び出し開始');
    trackApiUsage('gemini');
    
    // ストリーミングAPIを使用
    const response = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash-001',
      contents: prompt
    });
    
    let fullText = '';
    for await (const chunk of response) {
      if (chunk.text) {
        fullText += chunk.text;
        // リアルタイムでUIを更新する場合はここで処理
        debugLog(`ストリーミングチャンク: ${chunk.text.length}文字`);
      }
    }
    
    debugLog(`Gemini AI ストリーミング完了 (総${fullText.length}文字)`);
    return fullText;
    
  } catch (error) {
    debugLog(`Gemini AI ストリーミングエラー: ${error.message}`, 'error');
    throw error;
  }
}

// レビュー分析プロンプト生成
function createAnalysisPrompt(restaurantName, reviews) {
  const reviewTexts = reviews.map((review, index) => 
    `レビュー${index + 1} (評価: ${review.rating}/5): ${review.text}`
  ).join('\n\n');
  
  return `
あなたはレストラン分析の専門家です。以下のレストランのレビューを分析して、JSON形式で結果を返してください。

【レストラン名】
${restaurantName}

【レビューデータ】
${reviewTexts}

【重要な指示】
- 必ずvalidなJSONのみを返してください
- JSON以外の説明文は一切含めないでください
- 以下のフォーマットを厳密に守ってください

【分析項目】
1. sentimentScore: 全体的なポジティブ度合い (0.0-1.0の小数)
2. satisfactionScore: 総合満足度 (0-100の整数)
3. strengths: 優れている点 (最大3個の文字列配列)
4. improvements: 改善点 (最大3個の文字列配列)
5. recommendation: おすすめ理由 (50文字以内の文字列)
6. targetAudience: おすすめの客層 (30文字以内の文字列)
7. confidence: 分析の信頼度 (0.0-1.0の小数)

【出力例】
{
  "sentimentScore": 0.85,
  "satisfactionScore": 88,
  "strengths": ["料理が美味しい", "接客が丁寧", "雰囲気が良い"],
  "improvements": ["価格が高め", "待ち時間が長い"],
  "recommendation": "新鮮な食材と丁寧な調理で満足度の高い食事体験",
  "targetAudience": "美食を求める大人のカップル",
  "confidence": 0.9
}

上記のJSON形式のみで回答してください。
`;
}

// レビューをGemini AIで分析
async function analyzeReviewsWithAI(restaurantName, reviews, placeId) {
  if (reviews.length === 0) {
    return null;
  }
  
  // キャッシュから確認
  if (searchState.analysisCache.has(placeId)) {
    debugLog('キャッシュからAI分析結果を取得');
    return searchState.analysisCache.get(placeId);
  }
  
  try {
    debugLog(`AI分析開始: ${restaurantName} (${reviews.length}件のレビュー)`);
    updateStatus('Gemini 2.0がレビューを分析中...', 'loading');
    
    const prompt = createAnalysisPrompt(restaurantName, reviews);
    
    // 通常版またはストリーミング版を選択（デモでは通常版を使用）
    const aiResponse = await callGeminiAI(prompt);
    
    // JSONパース
    let analysisResult;
    try {
      // レスポンスからJSONを抽出（念のためコードブロックを除去）
      const cleanedResponse = aiResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^.*?(\{.*\}).*$/s, '$1')
        .trim();
      
      // JSONパース
      analysisResult = JSON.parse(cleanedResponse);
      
      debugLog('AI応答のJSONパース成功', 'info');
      
    } catch (parseError) {
      debugLog(`JSON解析エラー: ${parseError.message}`, 'error');
      debugLog(`AI応答: ${aiResponse}`, 'debug');
      
      // JSONの修復を試行
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
          debugLog('JSON修復に成功', 'warn');
        } else {
          throw new Error('JSONが見つかりません');
        }
      } catch (repairError) {
        throw new Error('AI応答の解析に失敗しました。再試行してください。');
      }
    }
    
    // バリデーションと正規化
    const validatedResult = {
      sentimentScore: Math.max(0, Math.min(1, parseFloat(analysisResult.sentimentScore) || 0.5)),
      satisfactionScore: Math.max(0, Math.min(100, parseInt(analysisResult.satisfactionScore) || 50)),
      strengths: Array.isArray(analysisResult.strengths) ? 
        analysisResult.strengths.slice(0, 3).filter(s => s && s.trim()) : ['分析データなし'],
      improvements: Array.isArray(analysisResult.improvements) ? 
        analysisResult.improvements.slice(0, 3).filter(s => s && s.trim()) : ['データ不足'],
      recommendation: (analysisResult.recommendation || 'Gemini 2.0で分析を実行しました').slice(0, 100),
      targetAudience: (analysisResult.targetAudience || 'すべての方').slice(0, 50),
      confidence: Math.max(0, Math.min(1, parseFloat(analysisResult.confidence) || 0.7))
    };
    
    // キャッシュに保存
    searchState.analysisCache.set(placeId, validatedResult);
    
    debugLog(`AI分析完了: 満足度スコア ${validatedResult.satisfactionScore}点`);
    updateStatus('Gemini 2.0分析が完了しました', 'success');
    
    return validatedResult;
    
  } catch (error) {
    debugLog(`AI分析エラー: ${error.message}`, 'error');
    updateStatus(`AI分析に失敗: ${error.message}`, 'error');
    
    // フォールバック結果を返す
    return {
      sentimentScore: 0.5,
      satisfactionScore: 50,
      strengths: ['分析データが取得できませんでした'],
      improvements: ['AI分析に失敗しました'],
      recommendation: 'レビューを手動で確認してください',
      targetAudience: 'すべての方',
      confidence: 0.1
    };
  }
}

// Google Maps API スクリプトの動的読み込み
function loadGoogleMapsAPI() {
  return new Promise((resolve, reject) => {
    if (!CONFIG.googleMapsApiKey || CONFIG.googleMapsApiKey === 'your_actual_api_key_here') {
      const error = 'Google Maps APIキーが設定されていません。.envファイルを確認してください。';
      debugLog(error, 'error');
      updateStatus(error, 'error');
      reject(new Error(error));
      return;
    }
    
    if (window.google && window.google.maps) {
      resolve();
      return;
    }
    
    debugLog('Google Maps API読み込み開始');
    updateStatus('Google Maps APIを読み込み中...', 'loading');
    
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.googleMapsApiKey}&libraries=places&language=ja&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    
    window.initGoogleMaps = () => {
      debugLog('Google Maps API読み込み完了');
      resolve();
    };
    
    script.onerror = () => {
      const error = 'Google Maps APIの読み込みに失敗しました';
      debugLog(error, 'error');
      updateStatus(error, 'error');
      reject(new Error(error));
    };
    
    window.gm_authFailure = () => {
      const error = 'Google Maps API認証エラー: APIキーが無効です';
      debugLog(error, 'error');
      updateStatus(error, 'error');
      reject(new Error(error));
    };
    
    document.head.appendChild(script);
  });
}

// マップの初期化
function initMap() {
  try {
    debugLog('マップ初期化開始');
    
    const defaultLocation = { 
      lat: CONFIG.defaultLat, 
      lng: CONFIG.defaultLng 
    };
    
    map = new google.maps.Map(document.getElementById("map"), {
      zoom: 15,
      center: defaultLocation,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
    });
    
    geocoder = new google.maps.Geocoder();
    placesService = new google.maps.places.PlacesService(map);
    debugLog('Places Service初期化完了');
    
    infoWindow = new google.maps.InfoWindow();
    
    map.addListener('center_changed', updateDebugPanel);
    map.addListener('zoom_changed', updateDebugPanel);
    
    map.addListener('idle', function() {
      google.maps.event.clearListeners(map, 'idle');
      
      updateStatus('マップの読み込み完了！', 'success');
      debugLog('マップ初期化完了');
      
      setTimeout(() => {
        getCurrentLocation();
      }, 500);
    });
    
  } catch (error) {
    debugLog(`マップ初期化エラー: ${error.message}`, 'error');
    updateStatus('マップの読み込みに失敗しました', 'error');
  }
}

// 現在地の取得
function getCurrentLocation() {
  if (!navigator.geolocation) {
    const errorMessage = 'Geolocation API がサポートされていません';
    debugLog(errorMessage, 'error');
    updateStatus('現在地機能がサポートされていません', 'error');
    return;
  }
  
  if (!map) {
    debugLog('マップが初期化されていないため、現在地取得をスキップ', 'warn');
    return;
  }
  
  debugLog('現在地取得開始');
  updateStatus('現在地を取得中...', 'loading');
  
  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 300000
  };
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      
      debugLog(`現在地取得成功: ${currentPosition.lat}, ${currentPosition.lng}`);
      updateStatus('現在地を取得しました', 'success');
      
      if (map) {
        map.setCenter(currentPosition);
        addCurrentLocationMarker(currentPosition);
        
        setTimeout(() => {
          searchNearbyRestaurants(currentPosition);
        }, 1000);
      }
    },
    (error) => {
      let errorMessage = '現在地の取得に失敗しました';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage += ': 位置情報のアクセスが拒否されました';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage += ': 位置情報が利用できません';
          break;
        case error.TIMEOUT:
          errorMessage += ': タイムアウトしました';
          break;
        default:
          errorMessage += `: 不明なエラー (${error.code})`;
          break;
      }
      
      debugLog(`現在地取得エラー: ${errorMessage}`, 'error');
      updateStatus(errorMessage, 'error');
    },
    options
  );
}

// 現在地マーカーを追加
function addCurrentLocationMarker(position) {
  const marker = new google.maps.Marker({
    position: position,
    map: map,
    title: "現在地",
    icon: {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" fill="#3498db" stroke="white" stroke-width="2"/>
          <circle cx="12" cy="12" r="3" fill="white"/>
        </svg>
      `),
      scaledSize: new google.maps.Size(24, 24),
      anchor: new google.maps.Point(12, 12)
    }
  });
  
  markers.push(marker);
  debugLog('現在地マーカーを追加');
}

// マーカーをクリア
function clearMarkers() {
  markers.forEach(marker => marker.setMap(null));
  markers = [];
  debugLog('現在地マーカーをクリア');
}

// レストランマーカーをクリア
function clearRestaurantMarkers() {
  restaurantMarkers.forEach(marker => marker.setMap(null));
  restaurantMarkers = [];
  searchState.restaurantResults = [];
  debugLog('レストランマーカーをクリア');
}

// 周辺レストラン検索
function searchNearbyRestaurants(location) {
  if (!placesService) {
    debugLog('Places Service が初期化されていません', 'error');
    updateStatus('レストラン検索機能が利用できません', 'error');
    return;
  }
  
  if (searchState.isSearching) {
    debugLog('既に検索中です', 'warn');
    return;
  }
  
  clearRestaurantMarkers();
  
  searchState.isSearching = true;
  searchState.lastSearchLocation = location;
  searchState.currentRadius = parseInt(document.getElementById('radius-select')?.value || 1000);
  
  debugLog(`レストラン検索開始: 半径${searchState.currentRadius}m`);
  updateStatus('周辺レストランを検索中...', 'loading');
  
  const request = {
    location: new google.maps.LatLng(location.lat, location.lng),
    radius: searchState.currentRadius,
    type: 'restaurant'
  };
  
  trackApiUsage('nearbySearch');
  
  placesService.nearbySearch(request, (results, status) => {
    searchState.isSearching = false;
    
    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
      debugLog(`レストラン検索成功: ${results.length}件発見`);
      updateStatus(`${results.length}件のレストランを発見しました`, 'success');
      
      searchState.restaurantResults = results;
      displayRestaurantMarkers(results);
      
    } else {
      debugLog(`レストラン検索失敗: ${status}`, 'error');
      updateStatus('レストランの検索に失敗しました', 'error');
    }
  });
}

// レストランマーカーを表示
function displayRestaurantMarkers(restaurants) {
  restaurants.forEach((restaurant, index) => {
    let markerColor = '#95a5a6';
    if (restaurant.rating >= 4.0) {
      markerColor = '#27ae60';
    } else if (restaurant.rating >= 3.0) {
      markerColor = '#f39c12';
    } else if (restaurant.rating > 0) {
      markerColor = '#e74c3c';
    }
    
    const marker = new google.maps.Marker({
      position: restaurant.geometry.location,
      map: map,
      title: restaurant.name,
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" fill="none">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 7.732 14 22 14 22s14-14.268 14-22C28 6.268 21.732 0 14 0z" fill="${markerColor}"/>
            <circle cx="14" cy="14" r="8" fill="white"/>
            <text x="14" y="18" text-anchor="middle" font-family="Arial" font-size="12" fill="${markerColor}">🍽</text>
          </svg>
        `),
        scaledSize: new google.maps.Size(28, 36),
        anchor: new google.maps.Point(14, 36)
      }
    });
    
    marker.addListener('click', () => {
      showRestaurantInfo(restaurant, marker);
    });
    
    restaurantMarkers.push(marker);
    
    if (index < 5) {
      debugLog(`レストラン${index + 1}: ${restaurant.name} (評価: ${restaurant.rating || 'なし'})`);
    }
  });
  
  debugLog(`${restaurants.length}個のレストランマーカーを追加`);
}

// レストラン基本情報を表示
function showRestaurantInfo(restaurant, marker) {
  const rating = restaurant.rating ? `⭐ ${restaurant.rating}` : '評価なし';
  const priceLevel = restaurant.price_level ? '💰'.repeat(restaurant.price_level) : '価格情報なし';
  
  let openStatus = '営業状況不明';
  if (restaurant.opening_hours) {
    if (restaurant.business_status === 'OPERATIONAL') {
      openStatus = '🟢 営業中';
    } else if (restaurant.business_status === 'CLOSED_TEMPORARILY') {
      openStatus = '🟡 一時休業';
    } else if (restaurant.business_status === 'CLOSED_PERMANENTLY') {
      openStatus = '🔴 閉店';
    } else {
      openStatus = '🕒 営業時間を確認';
    }
  } else {
    openStatus = '🕒 営業時間不明';
  }
  
  const content = `
    <div style="max-width: 300px; font-family: Arial, sans-serif;">
      <h3 style="margin: 0 0 10px 0; color: #2c3e50;">${restaurant.name}</h3>
      <p style="margin: 5px 0; color: #555;">
        <strong>評価:</strong> ${rating}
        ${restaurant.user_ratings_total ? `(${restaurant.user_ratings_total}件)` : ''}
      </p>
      <p style="margin: 5px 0; color: #555;"><strong>価格帯:</strong> ${priceLevel}</p>
      <p style="margin: 5px 0; color: #555;"><strong>営業状況:</strong> ${openStatus}</p>
      <p style="margin: 5px 0; color: #555;"><strong>住所:</strong> ${restaurant.vicinity}</p>
      <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button onclick="getRestaurantDetails('${restaurant.place_id}')" 
                style="flex: 1; min-width: 100px; padding: 8px 10px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
          📋 詳細情報
        </button>
        <button onclick="getRestaurantReviews('${restaurant.place_id}')" 
                style="flex: 1; min-width: 100px; padding: 8px 10px; background: #e67e22; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
          💬 レビュー
        </button>
        <button onclick="analyzeRestaurant('${restaurant.place_id}', '${restaurant.name.replace(/'/g, "\\'")}')" 
                style="width: 100%; padding: 8px 10px; background: #9b59b6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; margin-top: 5px;">
          🤖 Gemini 2.0分析
        </button>
      </div>
    </div>
  `;
  
  infoWindow.setContent(content);
  infoWindow.open(map, marker);
  
  debugLog(`レストラン情報表示: ${restaurant.name}`);
}

// レストラン詳細情報を取得
window.getRestaurantDetails = function(placeId) {
  debugLog(`詳細情報取得開始: ${placeId}`);
  updateStatus('詳細情報を取得中...', 'loading');
  
  if (searchState.detailsCache.has(placeId)) {
    const cachedDetails = searchState.detailsCache.get(placeId);
    showDetailedInfo(cachedDetails);
    debugLog('キャッシュから詳細情報を取得');
    return;
  }
  
  trackApiUsage('placeDetails');
  
  const request = {
    placeId: placeId,
    fields: [
      'name', 'formatted_address', 'formatted_phone_number',
      'website', 'opening_hours', 'rating', 'user_ratings_total',
      'price_level', 'photos', 'geometry', 'place_id', 'business_status'
    ]
  };
  
  placesService.getDetails(request, (place, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK && place) {
      searchState.detailsCache.set(placeId, place);
      
      debugLog(`詳細情報取得成功: ${place.name}`);
      updateStatus('詳細情報を取得しました', 'success');
      
      showDetailedInfo(place);
      
    } else {
      debugLog(`詳細情報取得失敗: ${status}`, 'error');
      updateStatus('詳細情報の取得に失敗しました', 'error');
    }
  });
};

// レストランレビューを取得
window.getRestaurantReviews = function(placeId) {
  debugLog(`レビュー取得開始: ${placeId}`);
  updateStatus('レビューを取得中...', 'loading');
  
  trackApiUsage('placeDetails');
  
  const request = {
    placeId: placeId,
    fields: ['name', 'reviews', 'rating', 'user_ratings_total']
  };
  
  placesService.getDetails(request, (place, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK && place) {
      debugLog(`レビュー取得成功: ${place.name} - ${place.reviews?.length || 0}件のレビュー`);
      updateStatus('レビューを取得しました', 'success');
      
      showReviewsModal(place);
      
    } else {
      debugLog(`レビュー取得失敗: ${status}`, 'error');
      updateStatus('レビューの取得に失敗しました', 'error');
    }
  });
};

// レストランのAI分析を実行
window.analyzeRestaurant = async function(placeId, restaurantName) {
  debugLog(`AI分析開始: ${restaurantName}`);
  updateStatus('レビューを取得してGemini 2.0で分析中...', 'loading');
  
  try {
    // まずレビューを取得
    const request = {
      placeId: placeId,
      fields: ['name', 'reviews', 'rating', 'user_ratings_total', 'place_id']
    };
    
    trackApiUsage('placeDetails');
    
    placesService.getDetails(request, async (place, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && place) {
        const reviews = place.reviews || [];
        
        if (reviews.length === 0) {
          updateStatus('レビューがないためAI分析できません', 'error');
          return;
        }
        
        try {
          // AI分析実行
          const analysisResult = await analyzeReviewsWithAI(place.name, reviews, placeId);
          
          if (analysisResult) {
            showAIAnalysisModal(place, analysisResult);
          }
          
        } catch (error) {
          debugLog(`AI分析エラー: ${error.message}`, 'error');
          updateStatus(`AI分析に失敗: ${error.message}`, 'error');
        }
      } else {
        debugLog(`レビュー取得失敗: ${status}`, 'error');
        updateStatus('レビューの取得に失敗しました', 'error');
      }
    });
    
  } catch (error) {
    debugLog(`AI分析処理エラー: ${error.message}`, 'error');
    updateStatus('AI分析処理に失敗しました', 'error');
  }
};

// 詳細情報を表示
function showDetailedInfo(place) {
  const photos = place.photos ? place.photos.slice(0, 3) : [];
  const photoHtml = photos.map(photo => 
    `<img src="${photo.getUrl({maxWidth: 100, maxHeight: 100})}" 
         style="width: 100px; height: 100px; object-fit: cover; border-radius: 4px; margin-right: 5px;">`
  ).join('');
  
  let openingHours = '<div style="color: #999;">営業時間情報なし</div>';
  let currentStatus = '🕒 営業状況不明';
  
  if (place.opening_hours) {
    if (typeof place.opening_hours.isOpen === 'function') {
      try {
        const isCurrentlyOpen = place.opening_hours.isOpen();
        currentStatus = isCurrentlyOpen ? '🟢 現在営業中' : '🔴 現在営業時間外';
      } catch (error) {
        debugLog(`営業状況確認エラー: ${error.message}`, 'warn');
        currentStatus = '🕒 営業状況を確認中';
      }
    }
    
    if (place.opening_hours.weekday_text) {
      openingHours = place.opening_hours.weekday_text
        .map(day => `<div style="font-size: 0.8rem; margin: 2px 0;">${day}</div>`)
        .join('');
    }
  }
  
  const content = `
    <div style="max-width: 400px; font-family: Arial, sans-serif; max-height: 400px; overflow-y: auto;">
      <h3 style="margin: 0 0 10px 0; color: #2c3e50;">${place.name}</h3>
      
      ${photoHtml ? `<div style="margin: 10px 0; white-space: nowrap; overflow-x: auto;">${photoHtml}</div>` : ''}
      
      <p style="margin: 5px 0; color: #555;">
        <strong>評価:</strong> ⭐ ${place.rating || 'なし'} 
        ${place.user_ratings_total ? `(${place.user_ratings_total}件)` : ''}
      </p>
      
      <p style="margin: 5px 0; color: #555;">
        <strong>現在の状況:</strong> ${currentStatus}
      </p>
      
      <p style="margin: 5px 0; color: #555;">
        <strong>住所:</strong> ${place.formatted_address || '情報なし'}
      </p>
      
      ${place.formatted_phone_number ? 
        `<p style="margin: 5px 0; color: #555;"><strong>電話:</strong> ${place.formatted_phone_number}</p>` : ''
      }
      
      ${place.website ? 
        `<p style="margin: 5px 0; color: #555;"><strong>ウェブサイト:</strong> 
         <a href="${place.website}" target="_blank" style="color: #3498db;">公式サイト</a></p>` : ''
      }
      
      <div style="margin: 10px 0;">
        <strong style="color: #2c3e50;">営業時間:</strong>
        <div style="margin-top: 5px; max-height: 120px; overflow-y: auto;">
          ${openingHours}
        </div>
      </div>
      
      <div style="margin-top: 15px; display: flex; gap: 8px;">
        <button onclick="getRestaurantReviews('${place.place_id}')" 
                style="flex: 1; padding: 10px; background: #e67e22; color: white; border: none; border-radius: 4px; cursor: pointer;">
          💬 レビューを見る
        </button>
        <button onclick="analyzeRestaurant('${place.place_id}', '${place.name.replace(/'/g, "\\'")}')" 
                style="flex: 1; padding: 10px; background: #9b59b6; color: white; border: none; border-radius: 4px; cursor: pointer;">
          🤖 Gemini 2.0分析
        </button>
      </div>
    </div>
  `;
  
  infoWindow.setContent(content);
}

// レビューモーダルを表示
function showReviewsModal(place) {
  const reviews = place.reviews || [];
  
  if (reviews.length === 0) {
    updateStatus('このレストランにはレビューがありません', 'info');
    return;
  }
  
  const reviewsHtml = reviews.map((review, index) => {
    const stars = '⭐'.repeat(review.rating);
    const timeAgo = new Date(review.time * 1000).toLocaleDateString('ja-JP');
    
    return `
      <div style="border-bottom: 1px solid #eee; padding: 15px 0; ${index === reviews.length - 1 ? 'border-bottom: none;' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="color: #2c3e50;">${review.author_name}</strong>
          <div>
            <span style="color: #f39c12;">${stars}</span>
            <span style="font-size: 0.8rem; color: #999; margin-left: 8px;">${timeAgo}</span>
          </div>
        </div>
        <p style="margin: 0; color: #555; line-height: 1.4; font-size: 0.9rem;">
          ${review.text}
        </p>
      </div>
    `;
  }).join('');
  
  const content = `
    <div style="max-width: 500px; font-family: Arial, sans-serif;">
      <h3 style="margin: 0 0 15px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
        💬 ${place.name} のレビュー
      </h3>
      
      <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
        <strong>総合評価:</strong> ⭐ ${place.rating || 'なし'} 
        (${place.user_ratings_total || 0}件のレビュー)
      </div>
      
      <div style="max-height: 250px; overflow-y: auto; padding-right: 10px; margin-bottom: 15px;">
        ${reviewsHtml}
      </div>
      
      <div style="text-align: center;">
        <button onclick="analyzeRestaurant('${place.place_id}', '${place.name.replace(/'/g, "\\'")}')" 
                style="padding: 12px 24px; background: #9b59b6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; font-weight: bold;">
          🤖 Gemini 2.0で分析
        </button>
      </div>
    </div>
  `;
  
  infoWindow.setContent(content);
  
  debugLog(`レビュー表示: ${place.name} - ${reviews.length}件`);
  
  if (CONFIG.isDevelopment) {
    console.log('=== レビューデータ（Gemini分析用）===');
    console.log('レストラン名:', place.name);
    console.log('総合評価:', place.rating);
    console.log('レビュー数:', reviews.length);
    reviews.forEach((review, index) => {
      console.log(`レビュー${index + 1}:`, {
        評価: review.rating,
        テキスト: review.text,
        投稿者: review.author_name
      });
    });
    console.log('=====================================');
  }
}

// AI分析結果モーダルを表示
function showAIAnalysisModal(place, analysisResult) {
  const confidenceColor = analysisResult.confidence > 0.7 ? '#27ae60' : 
                         analysisResult.confidence > 0.5 ? '#f39c12' : '#e74c3c';
  
  const strengthsHtml = analysisResult.strengths.map(strength => 
    `<li style="margin: 5px 0; color: #27ae60;">✓ ${strength}</li>`
  ).join('');
  
  const improvementsHtml = analysisResult.improvements.map(improvement => 
    `<li style="margin: 5px 0; color: #e67e22;">⚠ ${improvement}</li>`
  ).join('');
  
  const content = `
    <div style="max-width: 600px; font-family: Arial, sans-serif;">
      <h3 style="margin: 0 0 15px 0; color: #2c3e50; border-bottom: 2px solid #9b59b6; padding-bottom: 10px;">
        🤖 ${place.name} のGemini 2.0分析結果
      </h3>
      
      <!-- 満足度スコア -->
      <div style="margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; text-align: center;">
        <h4 style="margin: 0 0 10px 0; font-size: 1.1rem;">総合満足度スコア</h4>
        <div style="font-size: 2.5rem; font-weight: bold; margin: 10px 0;">
          ${analysisResult.satisfactionScore}<span style="font-size: 1.5rem;">/100</span>
        </div>
        <div style="font-size: 0.9rem; opacity: 0.9;">
          感情分析スコア: ${(analysisResult.sentimentScore * 100).toFixed(1)}%
        </div>
        <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 5px;">
          Powered by Gemini 2.0 Flash
        </div>
      </div>
      
      <!-- おすすめ理由とターゲット -->
      <div style="margin-bottom: 20px;">
        <div style="margin-bottom: 15px; padding: 12px; background: #e8f5e8; border-left: 4px solid #27ae60; border-radius: 4px;">
          <strong style="color: #27ae60;">💡 おすすめ理由:</strong><br>
          <span style="color: #2c3e50;">${analysisResult.recommendation}</span>
        </div>
        <div style="padding: 12px; background: #fff3cd; border-left: 4px solid #f39c12; border-radius: 4px;">
          <strong style="color: #f39c12;">🎯 おすすめの方:</strong><br>
          <span style="color: #2c3e50;">${analysisResult.targetAudience}</span>
        </div>
      </div>
      
      <!-- 強みと改善点 -->
      <div style="display: flex; gap: 15px; margin-bottom: 20px;">
        <div style="flex: 1;">
          <h4 style="margin: 0 0 10px 0; color: #27ae60;">👍 強み・良い点</h4>
          <ul style="margin: 0; padding-left: 20px; list-style: none;">
            ${strengthsHtml}
          </ul>
        </div>
        <div style="flex: 1;">
          <h4 style="margin: 0 0 10px 0; color: #e67e22;">👎 改善点</h4>
          <ul style="margin: 0; padding-left: 20px; list-style: none;">
            ${improvementsHtml}
          </ul>
        </div>
      </div>
      
      <!-- 信頼度 -->
      <div style="text-align: center; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 0.85rem; color: #666;">
        🎯 分析信頼度: <span style="color: ${confidenceColor}; font-weight: bold;">
        ${(analysisResult.confidence * 100).toFixed(1)}%</span>
        (${place.reviews?.length || 0}件のレビューをGemini 2.0 Flashで分析)
      </div>
      
      <div style="margin-top: 15px; text-align: center;">
        <button onclick="getRestaurantReviews('${place.place_id}')" 
                style="padding: 10px 20px; background: #e67e22; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">
          💬 元のレビューを見る
        </button>
        <button onclick="getRestaurantDetails('${place.place_id}')" 
                style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
          📋 詳細情報を見る
        </button>
      </div>
    </div>
  `;
  
  infoWindow.setContent(content);
  
  debugLog(`AI分析結果表示: ${place.name} - 満足度スコア ${analysisResult.satisfactionScore}点`);
  
  // 開発環境では詳細な分析結果をコンソールに出力
  if (CONFIG.isDevelopment) {
    console.log('=== Gemini 2.0分析結果（詳細）===');
    console.log('レストラン名:', place.name);
    console.log('満足度スコア:', analysisResult.satisfactionScore);
    console.log('感情分析スコア:', analysisResult.sentimentScore);
    console.log('強み:', analysisResult.strengths);
    console.log('改善点:', analysisResult.improvements);
    console.log('おすすめ理由:', analysisResult.recommendation);
    console.log('ターゲット:', analysisResult.targetAudience);
    console.log('信頼度:', analysisResult.confidence);
    console.log('==========================');
  }
}

// 場所を検索
function searchLocation() {
  const locationInput = document.getElementById('location-input');
  if (!locationInput || !locationInput.value.trim()) {
    updateStatus('検索する場所を入力してください', 'error');
    return;
  }
  
  const query = locationInput.value.trim();
  debugLog(`場所検索開始: ${query}`);
  updateStatus('場所を検索中...', 'loading');
  
  geocoder.geocode({ address: query }, (results, status) => {
    if (status === 'OK' && results.length > 0) {
      const location = results[0].geometry.location;
      const locationObj = {
        lat: location.lat(),
        lng: location.lng()
      };
      
      map.setCenter(location);
      map.setZoom(15);
      
      const marker = new google.maps.Marker({
        position: location,
        map: map,
        title: query,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#e74c3c" stroke="white" stroke-width="1"/>
              <circle cx="12" cy="9" r="2.5" fill="white"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(24, 24),
          anchor: new google.maps.Point(12, 24)
        }
      });
      
      markers.push(marker);
      
      debugLog(`場所検索成功: ${locationObj.lat}, ${locationObj.lng}`);
      updateStatus(`「${query}」を見つけました`, 'success');
      
      const debugLastSearch = document.getElementById('debug-last-search');
      if (debugLastSearch) {
        debugLastSearch.textContent = query;
      }
      
      setTimeout(() => {
        searchNearbyRestaurants(locationObj);
      }, 1000);
      
    } else {
      debugLog(`場所検索エラー: ${status}`, 'error');
      updateStatus('場所が見つかりませんでした', 'error');
    }
  });
}

// イベントリスナーの設定
function setupEventListeners() {
  debugLog('イベントリスナー設定開始');
  
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', searchLocation);
  }
  
  const currentLocationBtn = document.getElementById('current-location-btn');
  if (currentLocationBtn) {
    currentLocationBtn.addEventListener('click', getCurrentLocation);
  }
  
  const restaurantSearchBtn = document.getElementById('restaurant-search-btn');
  if (restaurantSearchBtn) {
    restaurantSearchBtn.addEventListener('click', () => {
      const center = map.getCenter();
      if (center) {
        searchNearbyRestaurants({
          lat: center.lat(),
          lng: center.lng()
        });
      }
    });
  }
  
  const radiusSelect = document.getElementById('radius-select');
  if (radiusSelect) {
    radiusSelect.addEventListener('change', () => {
      if (searchState.lastSearchLocation) {
        setTimeout(() => {
          searchNearbyRestaurants(searchState.lastSearchLocation);
        }, 100);
      }
    });
  }
  
  const debugToggleBtn = document.getElementById('debug-toggle-btn');
  if (debugToggleBtn) {
    debugToggleBtn.addEventListener('click', function() {
      const panel = document.getElementById('debug-panel');
      if (panel) {
        panel.classList.toggle('show');
        debugLog('デバッグパネル切り替え');
      }
    });
  }
  
  const locationInput = document.getElementById('location-input');
  if (locationInput) {
    locationInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        searchLocation();
      }
    });
  }
  
  debugLog('イベントリスナー設定完了');
}

// アプリケーションの初期化
async function initApp() {
  debugLog('アプリケーション初期化開始');
  debugLog(`環境: ${CONFIG.isDevelopment ? '開発' : '本番'}`);
  
  try {
    // Gemini AI の初期化
    const geminiInitialized = initializeGeminiAI();
    
    await loadGoogleMapsAPI();
    initMap();
    setupEventListeners();
    
    debugLog('アプリケーション初期化完了');
    
    if (geminiInitialized) {
      updateStatus('Gemini 2.0 Flash準備完了', 'success');
    } else {
      updateStatus('Gemini AI SDKの初期化に失敗しました', 'error');
    }
    
  } catch (error) {
    debugLog(`アプリケーション初期化エラー: ${error.message}`, 'error');
    updateStatus('アプリケーションの初期化に失敗しました', 'error');
  }
}

document.addEventListener('DOMContentLoaded', initApp);

if (CONFIG.isDevelopment) {
  console.log('🔧 開発モード - 設定情報:');
  console.log('Google Maps API Key設定:', CONFIG.googleMapsApiKey ? '✓' : '✗');
  console.log('Gemini API Key設定:', CONFIG.geminiApiKey ? '✓' : '✗');
  console.log('デフォルト位置:', CONFIG.defaultLat, CONFIG.defaultLng);
  console.log('🤖 最新Gemini AI SDK (gemini-2.0-flash-001) 統合版が利用可能です');
}