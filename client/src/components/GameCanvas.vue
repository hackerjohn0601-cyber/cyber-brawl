<template>
  <div class="app-wrapper">
    <!-- PORTRAIT MODE WARNING -->
    <div class="rotate-overlay">
      <div class="rotate-icon">📱</div>
      <div class="rotate-arrow">↻</div>
      <p>請將手機橫放以遊玩</p>
      <p style="font-size: 14px; opacity: 0.6;">Rotate your phone to landscape</p>
    </div>
    <div class="screen-wrapper" :style="wrapperStyle">

    
    <!-- GLOBAL CHAT UI -->
    <div v-if="gameState !== 'AUTH'" class="global-chat-ui" :class="{ focused: isChatFocused }">
      <div class="chat-messages" ref="chatContainerRef">
        <div v-for="msg in chatMessages" :key="msg.id" class="chat-message">
          <span class="chat-time">[{{ msg.time }}]</span>
          <span class="chat-user">{{ msg.username }}:</span>
          <span class="chat-text">{{ msg.text }}</span>
        </div>
      </div>
      <div class="chat-input-wrapper" v-show="isChatFocused || chatMessages.length > 0">
        <input 
          ref="chatInputRef"
          type="text" 
          v-model="chatInput" 
          class="chat-input" 
          placeholder="按下 / 鍵開啟聊天..."
          @focus="isChatFocused = true"
          @blur="isChatFocused = false"
        />
      </div>
    </div>


    <!-- SETTINGS PANEL -->
    <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
      <div class="settings-panel">
        <div class="settings-header">
          <h2>⚙️ 設定</h2>
          <button class="settings-close" @click="showSettings = false">✕</button>
        </div>
        
        <!-- AUDIO SETTINGS -->
        <div class="settings-section">
          <h3>🔊 音效設定</h3>
          <div class="volume-row">
            <span>🎵 BGM</span>
            <input type="range" min="0" max="1" step="0.05" v-model.number="bgmVol" @input="updateBgmVolume" />
            <span class="vol-pct">{{ Math.round(bgmVol * 100) }}%</span>
          </div>
          <div class="volume-row">
            <span>🔫 SFX</span>
            <input type="range" min="0" max="1" step="0.05" v-model.number="sfxVol" @input="updateSfxVolume" />
            <span class="vol-pct">{{ Math.round(sfxVol * 100) }}%</span>
          </div>
          <button class="mute-btn" @click="toggleMuteAll">{{ isMuted ? '🔇 取消靜音' : '🔊 靜音' }}</button>
        </div>

        <!-- KEY REBINDING -->
        <div class="settings-section">
          <h3>⌨️ 按鍵綁定</h3>
          <div class="keybind-grid">
            <div v-for="(key, action) in keyBindings" :key="action" class="keybind-row">
              <span class="keybind-action">{{ getActionLabel(action) }}</span>
              <button 
                class="keybind-btn" 
                :class="{ active: rebindingKey === action }"
                @click="startRebind(action)"
              >
                {{ rebindingKey === action ? '按下按鍵...' : formatKey(key) }}
              </button>
            </div>
          </div>
          <button class="reset-keys-btn" @click="resetKeyBindings">🔄 恢復預設</button>
        </div>
      </div>
    </div>

    <!-- FRIENDS SIDEBAR -->
    <div v-if="showFriends && gameState !== 'AUTH'" class="friends-sidebar">
      <div class="friends-header">
        <h3>👥 好友</h3>
        <button class="settings-close" @click="showFriends = false">✕</button>
      </div>
      <div class="friend-add-row">
        <input type="text" v-model="friendSearchInput" placeholder="輸入玩家名稱..." class="friend-search" />
        <button class="friend-add-btn" @click="sendFriendRequest">➕</button>
      </div>
      <div v-if="friendRequests.length" class="friend-section">
        <h4>📩 好友請求</h4>
        <div v-for="req in friendRequests" :key="req" class="friend-row request">
          <span>{{ req }}</span>
          <div>
            <button class="friend-action-btn accept" @click="acceptFriend(req)">✓</button>
            <button class="friend-action-btn decline" @click="declineFriend(req)">✕</button>
          </div>
        </div>
      </div>
      <div class="friend-section">
        <h4>在線好友</h4>
        <div v-for="f in friendList" :key="f.username" class="friend-row">
          <span class="friend-status" :class="{ online: f.online }">●</span>
          <span>{{ f.username }}</span>
          <button v-if="f.online" class="friend-action-btn invite" @click="inviteFriend(f.username)">⚔️</button>
          <button class="friend-action-btn remove" @click="removeFriend(f.username)">🗑️</button>
        </div>
        <div v-if="!friendList.length" style="color: #636e72; font-size: 12px; text-align: center; padding: 10px;">
          還沒有好友，趕快加一個吧！
        </div>
      </div>
    </div>

    <!-- FRIENDS + CLAN BUTTON -->
    <div v-if="gameState !== 'AUTH'" class="social-buttons">
      <button v-if="gameState === 'LOBBY'" class="social-btn" @click="fetchLeaderboard" title="排行榜">🏆</button>
      <button v-if="gameState === 'LOBBY'" class="social-btn" @click="showSpectateModal = true" title="觀戰大廳">📺</button>
      <button v-if="gameState === 'LOBBY'" class="social-btn" @click="toggleFriends" title="好友">👥</button>
      <button v-if="gameState === 'LOBBY'" class="social-btn" @click="toggleClan" title="戰隊">⚔️</button>
      <button class="social-btn" @click="showSettings = !showSettings" title="設定">⚙️</button>
    </div>

    <!-- SPECTATE MODAL -->
    <div v-if="showSpectateModal && gameState !== 'AUTH'" class="settings-overlay" @click.self="showSpectateModal = false">
      <div class="settings-panel" style="max-width: 400px;">
        <div class="settings-header">
          <h2>📺 觀戰大廳</h2>
          <button class="settings-close" @click="showSpectateModal = false">✕</button>
        </div>
        <div class="spectate-list">
          <div v-for="(details, slotId) in spectatorSlots" :key="slotId" class="friend-row" v-show="details.host">
            <span>{{ slotId }} (玩家: {{ details.host ? 1 : 0 }} + {{ details.guest ? 1 : 0 }}) 👁️{{ details.spectators.length }}</span>
            <button class="friend-add-btn" @click="joinSpectate(slotId)">觀戰</button>
          </div>
          <div v-if="!Object.values(spectatorSlots).some(d => d.host)" style="color: #636e72; font-size: 14px; text-align: center; padding: 10px;">
            目前沒有正在進行的對戰。
          </div>
        </div>
      </div>
    </div>

    <!-- LEADERBOARD MODAL -->
    <div v-if="showLeaderboardModal && gameState !== 'AUTH'" class="settings-overlay" @click.self="showLeaderboardModal = false">
      <div class="settings-panel" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
        <div class="settings-header">
          <h2>🏆 全服排行榜</h2>
          <button class="settings-close" @click="showLeaderboardModal = false">✕</button>
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <button class="auth-btn" style="flex: 1; padding: 10px;" :style="{ background: leaderboardTab === 'trophies' ? '#fbc531' : '#2f3640', color: leaderboardTab === 'trophies' ? 'black' : 'white' }" @click="leaderboardTab = 'trophies'">🏆 獎杯榜</button>
          <button class="auth-btn" style="flex: 1; padding: 10px;" :style="{ background: leaderboardTab === 'time' ? '#4cd137' : '#2f3640', color: leaderboardTab === 'time' ? 'black' : 'white' }" @click="leaderboardTab = 'time'">⏱️ 時間榜</button>
        </div>

        <div class="spectate-list">
          <div v-for="(user, index) in sortedLeaderboard" :key="user.username" class="friend-row" style="padding: 10px; font-size: 14px; background: rgba(0,0,0,0.3); border-radius: 8px; margin-bottom: 5px;">
            <div style="width: 30px; font-weight: bold; color: #fbc531;">#{{ index + 1 }}</div>
            <div style="flex: 1; font-weight: bold; color: white;">{{ user.username }}</div>
            <div v-if="leaderboardTab === 'trophies'" style="color: #fbc531;">🏆 {{ user.trophies }}</div>
            <div v-if="leaderboardTab === 'time'" style="color: #4cd137;">⏱️ {{ Math.floor(user.playTime / 60) }}h {{ user.playTime % 60 }}m</div>
          </div>
          <div v-if="!sortedLeaderboard.length" style="color: #636e72; text-align: center; padding: 10px;">
            載入中或沒有資料。
          </div>
        </div>
      </div>
    </div>

    <!-- CLAN PANEL -->
    <div v-if="showClan && gameState !== 'AUTH'" class="clan-panel-overlay" @click.self="showClan = false">
      <div class="clan-panel">
        <div class="settings-header">
          <h2>⚔️ 戰隊</h2>
          <button class="settings-close" @click="showClan = false">✕</button>
        </div>
        <div v-if="myClan">
          <div class="clan-info-box">
            <h3>{{ myClan.name }}</h3>
            <p>隊長: {{ myClan.leader }} | 成員: {{ myClan.members?.length }}/{{ myClan.maxMembers }}</p>
            <p>🏆 總獎盃: {{ myClan.trophies }}</p>
          </div>
          <div class="clan-members">
            <div v-for="m in myClan.members" :key="m" class="friend-row">
              <span>{{ m }}</span>
              <span v-if="m === myClan.leader" style="color: #feca57;">👑</span>
            </div>
          </div>

          <div v-if="myClan.members.includes(username)" class="clan-invite-section" style="margin-top: 15px; border-top: 1px solid #353b48; padding-top: 10px;">
            <h4 style="margin: 0 0 6px 0; font-size: 13px; color: #00d2d3;">🛡️ 邀請新成員加入</h4>
            <button class="settings-btn" style="padding: 4px 8px; font-size: 12px;" @click="fetchInvitablePlayers">重新整理名單</button>
            <div class="invitable-players" style="max-height: 100px; overflow-y: auto; margin-top: 8px;">
              <div v-for="p in invitablePlayers" :key="p" class="friend-row">
                <span>{{ p }}</span>
                <button class="friend-add-btn" @click="inviteToClan(p)">邀請</button>
              </div>
              <div v-if="!invitablePlayers.length" style="color: #636e72; font-size: 11px; text-align: center; padding: 4px;">目前沒有可邀請的線上玩家</div>
            </div>
          </div>

          <!-- CLAN CHAT -->
          <div class="clan-chat-section">
            <h4 style="margin: 0 0 6px 0; font-size: 13px; color: #a29bfe;">💬 戰隊聊天</h4>
            <div class="clan-chat-messages" ref="clanChatRef">
              <div v-for="msg in clanChatMessages" :key="msg.id" class="clan-chat-msg">
                <span class="clan-chat-time">{{ msg.time }}</span>
                <span class="clan-chat-name">{{ msg.username }}</span>
                <template v-if="msg.type === 'replay'">
                  <span class="clan-chat-replay">🎬 {{ msg.text }}</span>
                  <button class="clan-dl-replay-btn" @click="downloadSharedReplay(msg.replay)">📥 下載</button>
                </template>
                <span v-else class="clan-chat-text">{{ msg.text }}</span>
              </div>
              <div v-if="!clanChatMessages.length" style="color: #636e72; font-size: 11px; text-align: center; padding: 8px;">
                還沒有訊息，來說聲嗨吧！
              </div>
            </div>
            <div class="clan-chat-input-row">
              <input type="text" v-model="clanChatInput" placeholder="輸入訊息..." class="friend-search" @keydown.enter="sendClanChat" />
              <button class="friend-add-btn" @click="sendClanChat">📤</button>
            </div>
            <button class="mute-btn" style="margin-top: 6px; font-size: 12px;" @click="shareToClan">🎬 分享上場回放到戰隊</button>
          </div>

          <button class="mute-btn" style="background: rgba(255,75,87,0.15); color: #ff6b6b;" @click="leaveClan">離開戰隊</button>
        </div>
        <div v-else>
          <div class="settings-section">
            <h3>建立戰隊</h3>
            <input type="text" v-model="newClanName" placeholder="戰隊名稱" class="friend-search" style="margin-bottom: 8px;" />
            <input type="text" v-model="newClanDesc" placeholder="戰隊簡介 (選填)" class="friend-search" />
            <button class="mute-btn" @click="createClan">建立</button>
          </div>
          <div class="settings-section">
            <h3>加入戰隊</h3>
            <div v-for="c in clanList" :key="c.name" class="friend-row">
              <span>{{ c.name }} ({{ c.memberCount }}/{{ c.maxMembers }})</span>
              <button class="friend-action-btn accept" @click="joinClan(c.name)">加入</button>
            </div>
            <div v-if="!clanList.length" style="color: #636e72; font-size: 12px; text-align: center;">還沒有戰隊</div>
          </div>
        </div>
      </div>
    </div>

    <!-- BATTLE INVITE POPUP -->
    <div v-if="battleInvite" class="battle-invite-popup">
      <p>⚔️ <strong>{{ battleInvite.from }}</strong> 邀請你對戰！</p>
      <div>
        <button class="friend-action-btn accept" @click="acceptBattleInvite">接受</button>
        <button class="friend-action-btn decline" @click="battleInvite = null">拒絕</button>
      </div>
    </div>

    <!-- AUTH SCREEN -->
    <div v-if="gameState === 'AUTH'" class="auth-screen">
      <div class="auth-box">
        <h1 class="select-title" style="font-size: 2.5rem; margin-bottom: 2rem;">Cyber Brawl</h1>
        <h2 style="color: #fffa65; margin-bottom: 1rem;">{{ isLoginMode ? 'LOGIN' : 'REGISTER' }}</h2>
        
        <input type="text" v-model="authUsername" @keyup.enter="handleAuth" placeholder="Username" class="room-input" style="width: 100%; margin-bottom: 1rem;" />
        <input type="password" v-model="authPassword" @keyup.enter="handleAuth" placeholder="Password" class="room-input" style="width: 100%; margin-bottom: 1rem;" />
        
        <p v-if="authError" style="color: #ff4757; margin-bottom: 1rem;">{{ authError }}</p>
        
        <button class="start-btn" @click="handleAuth" style="width: 100%; margin-bottom: 1rem;">
          {{ isLoginMode ? 'ENTER LOBBY' : 'CREATE ACCOUNT' }}
        </button>
        
        <a href="#" @click.prevent="isLoginMode = !isLoginMode" style="color: #00d2d3; text-decoration: none;">
          {{ isLoginMode ? 'Need an account? Register' : 'Already have an account? Login' }}
        </a>
      </div>
    </div>

    <!-- LOBBY SCREEN -->
    <div v-show="gameState === 'LOBBY'" class="game-container">
      <canvas ref="lobbyCanvas" width="1024" height="576"></canvas>
      
      <!-- Secret Admin Trigger (Bottom Right Corner) -->
      <div 
        v-if="loggedInUsername === 'john'"
        @click="showAdminLogin = true" 
        style="position: absolute; bottom: 0; right: 0; width: 80px; height: 80px; cursor: pointer; z-index: 9999; background: transparent;"
        title="Admin Area">
      </div>

      <!-- Big Game Title -->
      <h1 class="select-title" style="position: absolute; top: 20px; width: 100%; text-align: center; pointer-events: none; font-size: 3rem; text-shadow: 2px 2px 10px rgba(0,0,0,0.8);">
        Cyber Brawl
      </h1>

      <div class="lobby-controls">
        <p><strong>[ W, A, S, D ]</strong> Move Around</p>
        <p><strong>[ Enter ]</strong> Interact with Portals</p>
      </div>

      <!-- Currency HUD (Top Right) -->
      <div 
        style="position: absolute; top: 20px; right: 20px; background: rgba(0,0,0,0.7); padding: 10px 15px; border-radius: 8px; border: 2px solid #ff9f43; color: white; display: flex; flex-direction: column; gap: 5px; pointer-events: none; z-index: 100;">
        <div style="font-weight: bold; font-size: 1.1rem; color: #ff9f43;">💳 玩家資產</div>
        <div>🎟️ 扭蛋代幣: <span style="color: #fbc531; font-weight: bold;">{{ tokens }}</span></div>
        <div>🏆 競技獎杯: <span style="color: #00d2d3; font-weight: bold;">{{ trophies }}</span></div>
        <div>🪙 裝備金幣: <span style="color: #fbc531; font-weight: bold;">{{ goldCoins }}</span></div>
      </div>

      <!-- Quick Access Buttons (Bottom) Removed per user request -->

      <!-- Modals removed and converted to full screen -->
    </div>

    <!-- TUTORIAL SCREEN -->
    <div v-if="gameState === 'TUTORIAL'" class="select-screen tutorial-screen">
      <button class="close-x-btn" @click="resumeLobby">✖</button>
      <h1 class="select-title">遊戲教學</h1>
      
      <div class="tutorial-content">
        <div class="tutorial-section">
          <h2 style="color: #fffa65">基本操作</h2>
          <div class="ctrl-grid" style="grid-template-columns: 1fr; text-align: center; max-width: 400px; margin: 0 auto;">
            <div class="ctrl-col">
              <h3>控制方式</h3>
              <p><kbd>W</kbd> 跳躍</p>
              <p><kbd>A</kbd> <kbd>D</kbd> 移動 (碎步)</p>
              <p><kbd>S</kbd> 向下</p>
              <p><kbd>Shift</kbd> 防禦 (大幅減傷)</p>
              <p><kbd>空白鍵</kbd> 攻擊鍵</p>
              <p><kbd>F</kbd> 專屬技能</p>
              <p><kbd>E</kbd> 終極技能</p>
            </div>
          </div>
        </div>

        <div class="tutorial-section">
          <h2 style="color: #ff4757">進階招式與 Combo</h2>
          <ul class="combat-tips">
            <li><strong>輕拳三連擊：</strong> <span>「連續按三次」攻擊鍵，打出一套三段連擊，最後一下會造成重擊並大幅擊退對手！</span></li>
            <li><strong>重拳：</strong> <span>「長按」攻擊鍵不放直到發紅光。造成 15 點傷害，並把對手擊退超遠！</span></li>
            <li><strong>掃堂腿：</strong> <span>按住 <strong>下 (S) + 攻擊鍵</strong>。超快速的低段攻擊，能將敵人原地打暈 1 秒鐘！</span></li>
            <li><strong>衝刺直拳：</strong> <span>按住 <strong>前 (A或D) + 攻擊鍵</strong>。瞬間往前高速突進並揮出重拳，追擊神技！</span></li>
            <li><strong>上挑擊飛：</strong> <span>按住 <strong>上 (W) + 長按攻擊鍵</strong>。能把敵人筆直打上高空，完美接續空中追擊！</span></li>
            <li><strong>瞬影反擊 (Parry)：</strong> <span>按住 <strong>後退鍵 + 防禦鍵 (Shift)</strong> 進入藍色防禦架勢。若此時被打中，將會免疫傷害並瞬間衝刺過去回擊對手 3 下！(冷卻時間 5 秒)</span></li>
            <li><strong>終極技能 (Ultimate)：</strong> <span>當你<strong>成功防禦對手攻擊 3 次</strong>後，畫面會提示「ULTIMATE READY」。此時按下 <strong>終極技能鍵 (E)</strong> 就會發動角色的專屬終極技能！</span></li>
            <li><strong>宗師爆發 (2000杯專屬)：</strong> <span>當你的競技獎杯數超過 2000，按下 <strong>G 鍵</strong> 將會暫停全世界的時間，並引發超級大爆炸！(冷卻時間 45 秒)</span></li>
            <li><strong>飛踢大絕：</strong> <span>組合鍵：<strong>上 + 攻擊鍵</strong> 輕點。飛到極高空後往下極速俯衝，造成 20 點傷害！</span></li>
            <li><strong>空中追擊 (Aerial Intercept)：</strong> <span>當對手在半空中（跳躍或飛踢）時，同時按下 <strong>上 + 技能鍵 (W+F)</strong>。角色會高速衝向空中將對手狠狠擊落在地，造成 25 點傷害並短暫暈眩！(冷卻時間 5 秒)</span></li>
            <li><strong>完美截擊 (Counter)：</strong> <span>如果對手使用飛踢，你可以抓準他落下的時機，在地面提前使出<strong>「重拳」 (長按空白鍵)</strong>，就能把他從半空中狠狠揍飛破解招式！</span></li>
          </ul>
        </div>
      </div>

      <button class="back-btn" @click="resumeLobby" style="margin-top: 2rem; border-color: #fffa65; color: #fffa65;">完成閱讀 (START)</button>
    </div>

    <!-- GACHA MODAL -->
    <div v-if="showGachaModal" class="modal-overlay" @click.self="showGachaModal = false; gachaResult = null">
      <div class="gacha-machine-wrapper" v-if="!isSpectator">
        <div class="gacha-machine" :class="{ 'is-rolling': isRollingGacha }">
          <!-- Glass dome with capsules -->
          <div class="gacha-glass">
            <div class="capsule" style="--c1: #ff7675; --c2: #d63031; top: 70%; left: 10%;"></div>
            <div class="capsule" style="--c1: #74b9ff; --c2: #0984e3; top: 60%; left: 40%;"></div>
            <div class="capsule" style="--c1: #55efc4; --c2: #00b894; top: 75%; left: 60%;"></div>
            <div class="capsule" style="--c1: #ffeaa7; --c2: #fdcb6e; top: 40%; left: 20%;"></div>
            <div class="capsule" style="--c1: #a29bfe; --c2: #6c5ce7; top: 50%; left: 60%;"></div>
            <div class="capsule" style="--c1: #ff9f43; --c2: #f368e0; top: 20%; left: 35%;"></div>
          </div>
          
          <!-- Machine body -->
          <div class="gacha-body">
            <div class="gacha-logo">STREET<br>GACHA</div>
            
            <div class="gacha-info">
              <p style="color: #fffa65; font-size: 1.2rem;">Tokens: {{ tokens }}</p>
              <p style="font-size: 0.8rem; color:#ccc">Wins: {{ cpuMatches }} / 2</p>
            </div>
            
            <!-- The big button -->
            <button class="gacha-button" @click="rollGacha" :disabled="tokens < 20 || isRollingGacha">
              <span v-if="isRollingGacha">...</span>
              <span v-else>ROLL ($20)</span>
            </button>
            
            <!-- Dispenser hole -->
            <div class="gacha-dispenser">
              <div v-if="gachaResult" class="gacha-dispensed-item"></div>
            </div>
          </div>
        </div>

        <!-- Result Popup -->
        <div v-if="gachaResult" class="gacha-result-popup">
          <h3 style="color: #4cd137; font-size: 1.8rem;">{{ gachaResult }}</h3>
          <button class="join-btn" @click="gachaResult = null" style="background: #7f8fa6; margin-top: 1rem;">OK</button>
        </div>
        
        <button class="close-gacha-btn" @click="showGachaModal = false; gachaResult = null">✖</button>
      </div>
    </div>

    <!-- QUEST MODAL -->
    <div v-if="showQuestModal" class="modal-overlay">
      <div class="modal quest-modal">
        <h2>📜 QUEST BOARD 📜</h2>
        <div class="quests-container" style="margin: 2rem 0; text-align: left;">
          <div v-if="!areAllQuestsDone">
            <h3 style="text-align: center; color: #fffa65; margin-bottom: 1rem;">主線解鎖任務</h3>
            <div class="quest-item" :class="{ completed: unlockedChars.includes('Brawler') }">
            <h3 style="color: #ff4757;">[ BRAWLER ] 狂戰士</h3>
            <p><strong>解鎖任務：</strong>在一場對戰中，成功防禦反擊 (Parry) 達到 3 次。</p>
            <p class="progress" v-if="!unlockedChars.includes('Brawler')">目前進度: {{ quests.parries }} / 3 (需單局達成)</p>
            <p class="progress" style="color: #4cd137" v-else>✔ 已解鎖</p>
          </div>
          
          <div class="quest-item" :class="{ completed: unlockedChars.includes('Sniper') }">
            <h3 style="color: #0097e6;">[ SNIPER ] 神射手</h3>
            <p><strong>解鎖任務：</strong>累計擊敗人機電腦 (CPU) 達到 10 次。</p>
            <p class="progress" v-if="!unlockedChars.includes('Sniper')">目前進度: {{ quests.cpuDefeated }} / 10</p>
            <p class="progress" style="color: #4cd137" v-else>✔ 已解鎖</p>
          </div>
          
          <div class="quest-item" :class="{ completed: unlockedChars.includes('Mage') }">
            <h3 style="color: #8c7ae6;">[ MAGE ] 魔法師</h3>
            <p><strong>解鎖任務：</strong>在一場對戰中，終極大絕招 (Ultimate) 命中對手達到 2 次。</p>
            <p class="progress" v-if="!unlockedChars.includes('Mage')">目前進度: {{ quests.ultimatesHit }} / 2 (需單局達成)</p>
            <p class="progress" style="color: #4cd137" v-else>✔ 已解鎖</p>
          </div>
          </div>
          <h3 v-if="areAllQuestsDone" style="text-align: center; color: #4cd137; margin-bottom: 1rem;">✔ 主線任務已全部完成！</h3>
          <h3 style="text-align: center; color: #fffa65; margin-bottom: 1rem;">📅 今日每日任務</h3>
          <div class="quest-item" v-for="(q, idx) in dailyQuests" :key="idx" :class="{ completed: q.done }">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <h3 style="color: #1e90ff; margin: 0;">{{ q.desc }}</h3>
              <button 
                v-if="!q.done && !hasUsedDailyRefresh" 
                @click="refreshDailyQuest(idx)"
                class="refresh-btn"
                title="隨機刷新此任務 (每日1次)"
              >
                🔄 刷新
              </button>
            </div>
            <p style="color: #fbc531;"><strong>獎勵：</strong> 50 ~ 100 枚裝備金幣</p>
            <p class="progress" v-if="!q.done">目前進度: {{ q.progress }} / {{ q.target }}</p>
            <p class="progress" style="color: #4cd137" v-else>✔ 已完成</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="join-btn" @click="closeQuestModal" style="background: #7f8fa6">CLOSE</button>
        </div>
      </div>
    </div>

    <!-- SHOP SCREEN -->
    <div v-if="gameState === 'SHOP'" class="shop-screen">
      <div class="shopkeeper-container">
        <div class="shop-dialogue">歡迎光臨隱藏商店！<br/>想要買什麼？</div>
        <img class="shopkeeper-img" src="/assets/shopkeeper.png" alt="Shop Boss" />
      </div>
      <h1 class="shop-title">BELL'S WEAPON SHOP</h1>
      <div class="shop-coins">
        裝備金幣 (Gold Coins): <span>{{ goldCoins }}</span>
      </div>
      
      <div class="shop-items-container">
        <!-- Item 1: Iron Armor -->
        <div class="shop-item">
          <div class="item-icon" style="background: #2f3640;">🛡️</div>
          <h3>鐵甲 (Iron Armor)</h3>
          <p>減少所有受到的傷害 1 點。</p>
          <div class="item-level">目前等級: {{ playerEquipment.defense }}</div>
          <div class="shop-btn-group">
            <button class="buy-btn" @click="buyEquipment('defense', 100)" :disabled="goldCoins < 100">
              購買 ($100)
            </button>
            <button class="buy-btn max-btn" @click="buyMaxEquipment('defense', 100)" :disabled="goldCoins < 100" style="background: #e1b12c;">
              加強所有 (Max)
            </button>
          </div>
        </div>

        <!-- Item 2: Power Gloves -->
        <div class="shop-item">
          <div class="item-icon" style="background: #c23616;">🥊</div>
          <h3>力量拳套 (Power Gloves)</h3>
          <p>增加所有造成的傷害 1 點。</p>
          <div class="item-level">目前等級: {{ playerEquipment.attack }}</div>
          <div class="shop-btn-group">
            <button class="buy-btn" @click="buyEquipment('attack', 150)" :disabled="goldCoins < 150">
              購買 ($150)
            </button>
            <button class="buy-btn max-btn" @click="buyMaxEquipment('attack', 150)" :disabled="goldCoins < 150" style="background: #e1b12c;">
              加強所有 (Max)
            </button>
          </div>
        </div>

        <!-- Item 3: Health Amulet -->
        <div class="shop-item">
          <div class="item-icon" style="background: #4cd137;">❤️</div>
          <h3>生命護身符 (Health Amulet)</h3>
          <p>增加最大生命值 20 點。</p>
          <div class="item-level">目前等級: {{ playerEquipment.maxHp / 20 }}</div>
          <div class="shop-btn-group">
            <button class="buy-btn" @click="buyEquipment('maxHp', 200, 20)" :disabled="goldCoins < 200">
              購買 ($200)
            </button>
            <button class="buy-btn max-btn" @click="buyMaxEquipment('maxHp', 200, 20)" :disabled="goldCoins < 200" style="background: #e1b12c;">
              加強所有 (Max)
            </button>
          </div>
        </div>
      </div>
      <button class="back-btn shop-back" @click="leaveShop">LEAVE SHOP</button>
    </div>

    <!-- SKIN SHOP SCREEN -->
    <div v-if="gameState === 'SKIN_SHOP'" class="shop-screen" style="background: linear-gradient(135deg, #1e272e, #2f3640);">
      <h1 class="shop-title" style="color: #e056fd;">服裝商店 (SKIN SHOP)</h1>
      <div class="shop-coins" style="background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px;">
        抽獎代幣 (Tokens): <span style="color: #fbc531;">{{ tokens }}</span> &nbsp;|&nbsp; 🏆 競技獎杯: <span style="color: #00d2d3;">{{ trophies }}</span>
      </div>
      
      <div style="display: flex; justify-content: center; gap: 2rem; margin-top: 2rem; max-width: 900px; margin-left: auto; margin-right: auto;">
        <!-- Left: Character List -->
        <div style="width: 250px; display: flex; flex-direction: column; gap: 10px;">
          <h2 style="color: white; border-bottom: 2px solid #e056fd; padding-bottom: 5px;">選擇角色</h2>
          <div v-for="char in unlockedChars" :key="char" 
               @click="p1Choice = char"
               style="padding: 10px; background: #353b48; border: 2px solid transparent; border-radius: 8px; cursor: pointer; transition: 0.2s;"
               :style="{ borderColor: p1Choice === char ? '#e056fd' : 'transparent', background: p1Choice === char ? '#4cd137' : '#353b48' }">
            <span style="color: white; font-weight: bold; font-size: 1.2rem;">{{ char }}</span>
          </div>
        </div>

        <!-- Center: Mannequin Display -->
        <div style="background: #1e272e; border: 4px solid #e056fd; border-radius: 12px; overflow: hidden; box-shadow: 0 0 20px rgba(224, 86, 253, 0.5);">
          <canvas ref="mannequinCanvas" width="300" height="400"></canvas>
        </div>

        <!-- Right: Skin Controls -->
        <div style="width: 300px; display: flex; flex-direction: column; justify-content: center; gap: 20px; background: rgba(0,0,0,0.3); padding: 20px; border-radius: 12px;">
          <h2 style="color: white; text-align: center;">當前造型</h2>
          
          <div class="skin-selector" style="margin: 0; max-width: 100%;">
            <button class="skin-arrow" @click="prevSkin(p1Choice)">&lt;</button>
            <div class="skin-info" style="text-align: center;">
              <div class="skin-name" :style="{ color: getSelectedSkin(p1Choice).color, fontSize: '1.3rem' }">{{ getSelectedSkin(p1Choice).name }}</div>
            </div>
            <button class="skin-arrow" @click="nextSkin(p1Choice)">&gt;</button>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <button v-if="!hasSkin(p1Choice, getSelectedSkin(p1Choice).id)" class="buy-skin-btn" @click="buySkin(p1Choice)" style="font-size: 1.2rem; padding: 10px 20px;">
              購買 ({{ getSelectedSkin(p1Choice).price }} Tokens)
            </button>
            <button v-else-if="!isSkinEquipped(p1Choice, getSelectedSkin(p1Choice).id)" class="equip-skin-btn" @click="equipSkin(p1Choice)" style="font-size: 1.2rem; padding: 10px 20px; background: #e056fd;">
              裝備此造型
            </button>
            <span v-else class="equipped-text" style="color: #4cd137; font-size: 1.5rem; display: block;">[ 已裝備 ]</span>
          </div>
        </div>
      </div>

      <button class="back-btn shop-back" @click="leaveSkinShop">LEAVE SHOP</button>
    </div>

    <!-- CHARACTER SELECT SCREEN -->
    <div v-if="gameState === 'CHAR_SELECT'" class="select-screen">
      <h1 class="select-title">SELECT YOUR FIGHTER</h1>
      
      <div class="selectors-container">
        <!-- Player 1 Select -->
        <div class="player-select p1-select" style="position: relative;">
          <h2 style="color: #ff4757" v-if="isOnline">YOUR FIGHTER</h2>
          <h2 style="color: #ff4757" v-else>PLAYER 1 (W,A,S,D)</h2>
          <div class="char-cards" :style="{ pointerEvents: localReady ? 'none' : 'auto' }">
            <div 
              v-for="(data, charName) in charData" 
              :key="'p1-'+charName"
              class="char-card" 
              :class="{ 
                selected: p1Choice === charName, 
                locked: !unlockedChars.includes(charName) 
              }"
              @click="!unlockedChars.includes(charName) ? null : selectChar(1, charName)"
            >
              <h3>{{ charName.toUpperCase() }}</h3>
              <p>Skill: {{ data.skill }}</p>
              <div v-if="unlockedChars.includes(charName)" style="color: #fbc531; font-weight: bold; margin-top: 5px;">
                Lv. {{ charLevels[charName] || 1 }}
              </div>
              <button v-if="unlockedChars.includes(charName)" class="preview-btn" @click.stop="previewChar = previewChar === charName ? null : charName">👁️</button>
              <div v-if="previewChar === charName" class="char-preview-tooltip">
                <div class="preview-passive">被動: {{ getPassiveDesc(charName) }}</div>
                <div class="preview-skill">技能: {{ data.skill }}</div>
                <div class="preview-stats">HP: {{ getCharStats(charName).hp }} | 速度: {{ getCharStats(charName).speed }}</div>
              </div>
              <div v-if="!unlockedChars.includes(charName)" class="locked-overlay">
                🔒 LOCKED
              </div>
            </div>
          </div>
          
          <div class="skin-selector" v-if="isVsCPU && unlockedChars.includes(p1Choice)" :style="{ pointerEvents: localReady ? 'none' : 'auto' }">
            <button class="skin-arrow" @click="prevSkin(p1Choice)">&lt;</button>
            <div class="skin-info">
              <div class="skin-name" :style="{ color: getSelectedSkin(p1Choice).color }">{{ getSelectedSkin(p1Choice).name }}</div>
              <span v-if="!hasSkin(p1Choice, getSelectedSkin(p1Choice).id)" class="equipped-text" style="color: #ff4757;">[ 未擁有 ]</span>
              <button v-else-if="!isSkinEquipped(p1Choice, getSelectedSkin(p1Choice).id)" class="equip-skin-btn" @click="equipSkin(p1Choice)">裝備此造型</button>
              <span v-else class="equipped-text" style="color: #4cd137;">[ 已裝備 ]</span>
            </div>
            <button class="skin-arrow" @click="nextSkin(p1Choice)">&gt;</button>
          </div>

          <div v-if="isOnline && localReady" class="ready-stamp" style="color: #ff4757">READY</div>
        </div>

        <!-- Player 2 Select -->
        <div class="player-select p2-select" :style="{ opacity: isOnline ? 0.5 : 1, position: 'relative' }">
          <h2 style="color: #1e90ff" v-if="isOnline">OPPONENT</h2>
          <h2 style="color: #1e90ff" v-else-if="isVsCPU">CPU PLAYER</h2>
          <h2 style="color: #1e90ff" v-else>PLAYER 2 (Arrows)</h2>
          
          <div class="room-info" v-if="onlineState.roomCode">
            <h3>房間代碼: {{ onlineState.roomCode }}</h3>
            <p v-if="!hasOpponent && !isSpectator">等待對手加入... 或將代碼分享給好友</p>
            <p v-if="isSpectator">目前為觀戰模式 👁️</p>
            
            <div v-if="onlineState.isHost && !hasOpponent" style="margin-top: 15px;">
              <button class="settings-btn" @click="startOnlineTraining">🤖 進行公開訓練 (打電腦)</button>
            </div>
          </div>
          
          <div v-if="isOnline && !hasOpponent && !isSpectator" style="display: flex; flex-direction: column; height: 100%; justify-content: center; align-items: center; text-align: center;">
            <h3 style="margin-bottom: 2rem; color: #fffa65; animation: pulse 1s infinite;">Waiting for Challenger...</h3>
            <div class="bottom-actions" style="margin-top: 0;">
              <button class="back-btn" @click="resumeLobby">BACK TO LOBBY</button>
            </div>
          </div>
          <div v-else-if="isVsCPU" class="cpu-waiting" style="display: flex; flex-direction: column; height: 100%; justify-content: center; align-items: center;">
            <h3 style="margin-bottom: 2rem;">CPU will select a random character...</h3>
            <div class="bottom-actions" style="margin-top: 0;">
              <button class="back-btn" @click="resumeLobby">BACK</button>
              <button class="start-btn" :disabled="!p1Choice" @click="startGame">FIGHT!</button>
            </div>
          </div>
          <div v-else class="char-cards" :style="{ pointerEvents: isOnline || localReady ? 'none' : 'auto' }">
            <div 
              v-for="(data, charName) in charData" 
              :key="'p2-'+charName"
              class="char-card" 
              :class="{ 
                selected: p2Choice === charName,
                locked: !unlockedChars.includes(charName) && !isOnline 
              }"
              @click="(!unlockedChars.includes(charName) && !isOnline) ? null : selectChar(2, charName)"
            >
              <h3>{{ charName.toUpperCase() }}</h3>
              <p>Skill: {{ data.skill2 }}</p>
              <div v-if="unlockedChars.includes(charName) || isOnline" style="color: #fbc531; font-weight: bold; margin-top: 5px;">
                Lv. {{ charLevels[charName] || 1 }}
              </div>
              <div v-if="!unlockedChars.includes(charName) && !isOnline" class="locked-overlay">
                🔒 LOCKED
              </div>
            </div>
          </div>
          <div v-if="isOnline && remoteReady" class="ready-stamp" style="color: #1e90ff">READY</div>
        </div>
      </div>

      <div v-if="!isVsCPU" class="bottom-actions">
        <button class="back-btn" @click="resumeLobby">BACK</button>
        <div class="controls-info" style="margin-top: 15px;" v-if="!isSpectator">
          <p v-if="isOnline">{{ onlineState.isHost ? '你是 Player 1 (紅方)' : '你是 Player 2 (藍方)' }}</p>
          <p v-if="isOnline && hasOpponent && (!localReady || !remoteReady)">請選擇角色後點擊準備</p>
          <div style="display: flex; gap: 15px; justify-content: center; margin-top: 10px;">
            <button v-if="isOnline && hasOpponent" 
                    class="auth-btn" 
                    @click="toggleReady"
                    :class="{ 'ready-state': localReady }"
            >
              {{ localReady ? '取消準備' : '準備完成' }}
            </button>
            <button class="auth-btn" @click="leaveLobby" style="background: #e74c3c; border-color: #c0392b;">離開房間</button>
          </div>
        </div>
        <div class="controls-info" style="margin-top: 15px;" v-else>
          <div style="display: flex; gap: 15px; justify-content: center; margin-top: 10px;">
            <button class="auth-btn" @click="leaveLobby" style="background: #e74c3c; border-color: #c0392b;">🚪 離開觀戰</button>
          </div>
        </div>
      </div>
    </div>

    <!-- BATTLE SCREEN -->
    <div v-if="gameState === 'FIGHT'" class="game-container">
      <canvas ref="gameCanvas" width="1024" height="576"></canvas>

      <!-- UI Overlay for Health Bars -->
      <div class="ui-layer" v-show="!isCinematicActive">
        <div class="health-wrapper p1-health">
          <div class="char-name" style="color: #ff4757">{{ p1Choice }}</div>
          <div class="health-bar-bg">
            <div class="health-bar-fill" :style="{ width: ((p1Health / p1MaxHealth) * 100) + '%' }"></div>
          </div>
          <!-- Block Counter / Ultimate UI -->
          <div class="ultimate-hud">
            <div class="blocks">
              <span class="block-pip" :class="{'filled': p1BlockCount >= 1}"></span>
              <span class="block-pip" :class="{'filled': p1BlockCount >= 2}"></span>
              <span class="block-pip" :class="{'filled': p1BlockCount >= 3}"></span>
            </div>
            <div v-if="p1UltimateReady && !isSpectator" class="ultimate-prompt">ULTIMATE READY! [E]</div>
          </div>
          <!-- Cooldown UI with Numericals -->
          <div class="cooldown-hud">
            <span :class="{'cd-ready': p1CD.skill, 'cd-cooling': !p1CD.skill}">SKILL <small v-if="!p1CD.skill">{{ p1CD.skillTimer }}s</small></span>
            <span :class="{'cd-ready': p1CD.diveKick, 'cd-cooling': !p1CD.diveKick}">DIVE KICK <small v-if="!p1CD.diveKick">{{ p1CD.diveKickTimer }}s</small></span>
            <span :class="{'cd-ready': p1CD.counter, 'cd-cooling': !p1CD.counter}">PARRY <small v-if="!p1CD.counter">{{ p1CD.counterTimer }}s</small></span>
            <span :class="{'cd-ready': p1CD.pursuit, 'cd-cooling': !p1CD.pursuit}">INTERCEPT <small v-if="!p1CD.pursuit">{{ p1CD.pursuitTimer }}s</small></span>
            <span :class="{'cd-ready': p1CD.sweep, 'cd-cooling': !p1CD.sweep}">SWEEP <small v-if="!p1CD.sweep">{{ p1CD.sweepTimer }}s</small></span>
            <span :class="{'cd-ready': p1CD.defend, 'cd-cooling': !p1CD.defend}">DEFEND <small v-if="!p1CD.defend">{{ p1CD.defendTimer }}s</small></span>
            <span v-if="trophies >= 2000" :class="{'cd-ready': p1CD.burst, 'cd-cooling': !p1CD.burst}" style="border-color: #e056fd; color: #e056fd;">BURST <small v-if="!p1CD.burst">{{ p1CD.burstTimer }}s</small></span>
          </div>
        </div>

        <div class="timer">{{ gameTimer }}</div>

        <div class="health-wrapper p2-health">
          <div class="char-name" style="text-align: right; color: #1e90ff">
            {{ isVsCPU ? 'CPU: ' : '' }}{{ p2Choice }}
          </div>
          <div class="health-bar-bg">
            <div class="health-bar-fill" :style="{ width: ((p2Health / p2MaxHealth) * 100) + '%' }"></div>
          </div>
          <!-- Block Counter / Ultimate UI -->
          <div class="ultimate-hud" style="justify-content: flex-end;">
            <div v-if="p2UltimateReady && !isSpectator" class="ultimate-prompt">ULTIMATE READY! [P]</div>
            <div class="blocks">
              <span class="block-pip" :class="{'filled': p2BlockCount >= 1}"></span>
              <span class="block-pip" :class="{'filled': p2BlockCount >= 2}"></span>
              <span class="block-pip" :class="{'filled': p2BlockCount >= 3}"></span>
            </div>
          </div>
          <!-- Cooldown UI with Numericals (P2) -->
          <div class="cooldown-hud">
            <span :class="{'cd-ready': p2CD.pursuit, 'cd-cooling': !p2CD.pursuit}">INTERCEPT <small v-if="!p2CD.pursuit">{{ p2CD.pursuitTimer }}s</small></span>
            <span :class="{'cd-ready': p2CD.counter, 'cd-cooling': !p2CD.counter}">PARRY <small v-if="!p2CD.counter">{{ p2CD.counterTimer }}s</small></span>
            <span :class="{'cd-ready': p2CD.diveKick, 'cd-cooling': !p2CD.diveKick}">DIVE KICK <small v-if="!p2CD.diveKick">{{ p2CD.diveKickTimer }}s</small></span>
            <span :class="{'cd-ready': p2CD.skill, 'cd-cooling': !p2CD.skill}">SKILL <small v-if="!p2CD.skill">{{ p2CD.skillTimer }}s</small></span>
            <span :class="{'cd-ready': p2CD.sweep, 'cd-cooling': !p2CD.sweep}">SWEEP <small v-if="!p2CD.sweep">{{ p2CD.sweepTimer }}s</small></span>
            <span :class="{'cd-ready': p2CD.defend, 'cd-cooling': !p2CD.defend}">DEFEND <small v-if="!p2CD.defend">{{ p2CD.defendTimer }}s</small></span>
            <span v-if="p2CD.hasBurst" :class="{'cd-ready': p2CD.burst, 'cd-cooling': !p2CD.burst}" style="border-color: #e056fd; color: #e056fd;">BURST <small v-if="!p2CD.burst">{{ p2CD.burstTimer }}s</small></span>
          </div>
        </div>
      </div>

      <!-- Round Start Overlay -->
      <div v-if="roundStartText && roundStartText !== 'VS_SCREEN'" class="round-start-overlay">
        <h1 class="start-text">{{ roundStartText }}</h1>
      </div>

      <!-- VS Screen Overlay -->
      <div v-if="roundStartText === 'VS_SCREEN'" class="vs-screen-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 100; color: white;">
        
        <div style="flex: 1; text-align: center; border-right: 4px solid #e056fd; padding: 20px;">
          <h2 style="font-size: 2.5rem; color: #ff4757; text-shadow: 0 0 10px #ff4757;">{{ isOnline && !networkManager.isHost ? opponentUsername : loggedInUsername }}</h2>
          <h3 style="font-size: 1.8rem; margin: 10px 0; color: #f1c40f;">{{ p1Choice }}</h3>
          <p style="font-size: 1.2rem; margin: 5px 0;">🏆 獎杯: <span style="color: #00d2d3;">{{ trophies }}</span></p>
          <p style="font-size: 1.2rem; margin: 5px 0;">⏱️ 使用時間: <span style="color: #2ed573;">{{ charPlayTime[p1Choice] || 0 }} 分鐘</span></p>
        </div>
        
        <div style="font-size: 4rem; font-weight: 900; font-style: italic; color: white; text-shadow: 0 0 20px #e056fd, 0 0 40px #e056fd; margin: 0 20px; animation: pulse 1s infinite alternate;">
          VS
        </div>
        
        <div style="flex: 1; text-align: center; border-left: 4px solid #e056fd; padding: 20px;">
          <h2 style="font-size: 2.5rem; color: #3498db; text-shadow: 0 0 10px #3498db;">{{ isOnline ? (networkManager.isHost ? opponentUsername : loggedInUsername) : (isVsCPU ? 'CPU' : 'Player 2') }}</h2>
          <h3 style="font-size: 1.8rem; margin: 10px 0; color: #f1c40f;">{{ p2Choice }}</h3>
          <p style="font-size: 1.2rem; margin: 5px 0;">🏆 獎杯: <span style="color: #00d2d3;">{{ isOnline ? '???' : (isVsCPU ? '---' : '---') }}</span></p>
          <p style="font-size: 1.2rem; margin: 5px 0;">⏱️ 使用時間: <span style="color: #2ed573;">{{ isOnline ? '???' : (isVsCPU ? '---' : '---') }}</span></p>
        </div>

      </div>

      <!-- Game Over Overlay -->
      <div v-if="gameOver" class="game-over-overlay">
        <h1 class="result-text">{{ resultText }}</h1>
        <div class="post-game-buttons">
          <template v-if="resultText !== 'OPPONENT DISCONNECTED'">
            <button v-if="!isOnline" @click="resetGame" class="reset-button">REMATCH</button>
            <button v-else @click="toggleRematchReady" class="reset-button" :style="{ borderColor: localRematchReady ? '#4cd137' : 'white', color: localRematchReady ? '#4cd137' : 'white' }">
              {{ localRematchReady ? 'WAITING FOR OPPONENT...' : 'REMATCH' }}
            </button>
          </template>
          <button @click="backToSelect" class="reset-button">CHANGE CHARACTER</button>
          <button @click="leaveLobby" class="reset-button" style="border-color: #ff4757; color: #ff4757;">RETURN TO LOBBY</button>
          <button @click="downloadReplay" class="reset-button" style="border-color: #a29bfe; color: #a29bfe;">📹 下載回放</button>
          <button @click="shareReplay" class="reset-button" style="border-color: #48dbfb; color: #48dbfb;">📋 分享回放</button>
        </div>
      </div>

      <div class="controls-overlay" v-if="roundStartText && !gameOver">
        <div class="player-info p1-info">
          <h2>Player 1</h2>
          <p>Move: W, A, D | Defend: Shift</p>
          <p>Attack: Space | Sweep: S + Space</p>
          <p>Skill: F</p>
        </div>
        <div class="player-info p2-info" v-if="!isVsCPU">
          <h2>Player 2</h2>
          <template v-if="isOnline">
            <p>Remote Opponent</p>
          </template>
          <template v-else>
            <p>Move: Arrows | Defend: Down</p>
            <p>Attack: Enter (Hold for Heavy)</p>
            <p>Skill: Shift</p>
          </template>
        </div>
      </div>
    </div>

    <!-- ADMIN LOGIN MODAL -->
    <div v-if="showAdminLogin" class="modal-overlay" @click.self="showAdminLogin = false">
      <div class="modal-content" style="background: #e84118; border: 4px solid #c23616;">
        <button class="close-x-btn" @click="showAdminLogin = false">✖</button>
        <h2 style="color: white; margin-bottom: 1rem;">系統管理員登入 (ADMIN)</h2>
        <p style="color: #fbc531; margin-bottom: 1rem;">Warning: Unauthorized access is prohibited.</p>
        <input 
          v-model="adminPasswordInput" 
          type="password" 
          placeholder="Admin Password" 
          class="auth-input"
          style="font-size: 2rem; padding: 1rem; text-align: center; letter-spacing: 0.5rem;"
          @keyup.enter="adminLogin"
        />
        <button class="auth-btn" style="background: #c23616;" @click="adminLogin">AUTHENTICATE</button>
      </div>
    </div>

    <!-- ADMIN DASHBOARD MODAL -->
    <div v-if="showAdminDashboard" class="modal-overlay" @click.self="showAdminDashboard = false">
      <div class="modal-content admin-dashboard" style="background: #2f3640; border: 4px solid #fbc531; width: 600px;">
        <button class="close-x-btn" @click="showAdminDashboard = false">✖</button>
        <h2 style="color: #fbc531; margin-bottom: 1rem;">🛠️ 管理員控制台 (ADMIN DASHBOARD)</h2>
        
        <div class="admin-actions">
          <button class="admin-btn money-btn" @click="grantMoney">💰 增加 99,999 金幣</button>
          <button class="admin-btn" style="background: #3498db;" @click="grantTrophies">🏆 增加 10 獎杯</button>
          <button class="admin-btn" style="background: #9b59b6;" @click="resetTrophiesTo1990">⏪ 獎杯降回1990 (重看彩蛋)</button>
          <button class="admin-btn" style="background: #e84118;" @click="resetAccount">🔄 解除神仙模式 (歸零裝備金幣)</button>
          <button class="admin-btn refresh-btn" @click="refreshOnlinePlayers">🔄 重新整理玩家名單</button>
        </div>

        <!-- Tabs -->
        <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; border-bottom: 2px solid #718093; padding-bottom: 0.5rem;">
          <button 
            @click="adminActiveTab = 'online'"
            :style="{ padding: '0.5rem 1rem', background: adminActiveTab === 'online' ? '#4cd137' : '#2f3640', color: adminActiveTab === 'online' ? 'black' : 'white', border: '1px solid #718093', borderRadius: '4px 4px 0 0', cursor: 'pointer', fontWeight: 'bold' }">
            🟢 在線帳號
          </button>
          <button 
            @click="adminActiveTab = 'registered'"
            :style="{ padding: '0.5rem 1rem', background: adminActiveTab === 'registered' ? '#fbc531' : '#2f3640', color: adminActiveTab === 'registered' ? 'black' : 'white', border: '1px solid #718093', borderRadius: '4px 4px 0 0', cursor: 'pointer', fontWeight: 'bold' }">
            📝 已註冊帳號
          </button>
        </div>

        <!-- Online Tab Content -->
        <div v-if="adminActiveTab === 'online'" class="player-list-container" style="max-height: 250px; margin-top: 0.5rem;">
          <div v-if="onlineUsers.length === 0" style="color: #7f8fa6; padding: 1rem; text-align: center;">目前沒有在線帳號。</div>
          <div v-for="user in onlineUsers" :key="'online-' + user.username" class="player-row">
            <div class="player-info" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span class="player-name" style="font-weight: bold; font-size: 1.1rem; color: #ff9f43;">帳號: {{ user.username }}</span>
              <span style="color: #4cd137; font-size: 0.8rem; border: 1px solid #4cd137; padding: 0.1rem 0.3rem; border-radius: 4px;">線上</span>
            </div>
            <div v-if="user.username !== 'john'" style="display: flex; gap: 0.5rem;">
              <button class="admin-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #00b894;" @click="grantCurrencyToTarget(user.username, 'tokens', 10)">送10代幣</button>
              <button class="admin-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #fdcb6e; color: black;" @click="grantCurrencyToTarget(user.username, 'goldCoins', 1000)">送1000金幣</button>
              <button class="ban-btn" @click="banTarget(user.username)">🚫 BAN</button>
            </div>
            <span v-else style="color: #4cd137; font-weight: bold;">[ADMIN]</span>
          </div>
        </div>

        <!-- Registered Tab Content -->
        <div v-if="adminActiveTab === 'registered'" class="player-list-container" style="max-height: 250px; margin-top: 0.5rem;">
          <div v-if="allUsers.length === 0" style="color: #7f8fa6; padding: 1rem; text-align: center;">目前沒有任何註冊帳號。</div>
          <div v-for="user in allUsers" :key="'all-' + user.username" class="player-row">
            <div class="player-info" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span class="player-name" style="font-weight: bold; font-size: 1.1rem; color: #ff9f43;">帳號: {{ user.username }}</span>
              <span v-if="user.isOnline" style="color: #4cd137; font-size: 0.8rem; border: 1px solid #4cd137; padding: 0.1rem 0.3rem; border-radius: 4px;">線上</span>
              <span v-else style="color: #718093; font-size: 0.8rem; border: 1px solid #718093; padding: 0.1rem 0.3rem; border-radius: 4px;">離線</span>
            </div>
            <div v-if="user.username !== 'john'" style="display: flex; gap: 0.5rem;">
              <button class="admin-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #00b894;" @click="grantCurrencyToTarget(user.username, 'tokens', 10)">送10代幣</button>
              <button class="admin-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: #fdcb6e; color: black;" @click="grantCurrencyToTarget(user.username, 'goldCoins', 1000)">送1000金幣</button>
              <button class="ban-btn" @click="banTarget(user.username)">🚫 BAN</button>
            </div>
            <span v-else style="color: #4cd137; font-weight: bold;">[ADMIN]</span>
          </div>
        </div>
      </div>
    </div>

    <!-- MILESTONE CELEBRATION OVERLAY -->
    <div v-if="showMilestoneCelebration" class="milestone-overlay" @click="showMilestoneCelebration = false">
      <div class="fireworks"></div>
      <div class="milestone-content">
        <h1 v-if="milestoneType === 1000" class="milestone-title gold-text">🏆 晉升傳奇冠軍！🏆</h1>
        <h2 v-if="milestoneType === 1000" class="milestone-sub">解鎖全角色黃金皇冠 (Champion Skin)！</h2>
        
        <h1 v-if="milestoneType === 2000" class="milestone-title grandmaster-text">🌟 登頂榮耀宗師！🌟</h1>
        <h2 v-if="milestoneType === 2000" class="milestone-sub">解鎖終極大招與榮耀宗師 (Grandmaster) 限定造型！</h2>
        
        <p class="click-to-continue">點擊畫面繼續 (Click to continue)</p>
      </div>
    </div>

    <!-- MOBILE CONTROLS OVERLAY -->
    <div v-if="isTouchDevice && (gameState === 'FIGHT' || gameState === 'LOBBY' || gameState === 'TRAINING')" class="mobile-controls-overlay">
      <!-- Virtual Joystick Zone (Left Half) -->
      <div class="joystick-zone" @touchstart.prevent="handleTouchStart" @touchmove.prevent="handleTouchMove" @touchend.prevent="handleTouchEnd" @touchcancel.prevent="handleTouchEnd">
        <div class="joystick-base" v-show="joystick.active" :style="{ left: joystick.originX + 'px', top: joystick.originY + 'px' }">
          <div class="joystick-nub" :style="{ transform: `translate(${joystick.deltaX}px, ${joystick.deltaY}px)` }"></div>
        </div>
      </div>
      
      <!-- Action Buttons (Right Half) -->
      <div class="action-buttons">
        <button class="action-btn attack" @touchstart.prevent="dispatchKeyEvent('attack', true)" @touchend.prevent="dispatchKeyEvent('attack', false)" @touchcancel.prevent="dispatchKeyEvent('attack', false)">👊</button>
        <button class="action-btn skill" @touchstart.prevent="dispatchKeyEvent('skill', true)" @touchend.prevent="dispatchKeyEvent('skill', false)" @touchcancel.prevent="dispatchKeyEvent('skill', false)">🔥</button>
        <button class="action-btn defend" @touchstart.prevent="dispatchKeyEvent('defend', true)" @touchend.prevent="dispatchKeyEvent('defend', false)" @touchcancel.prevent="dispatchKeyEvent('defend', false)">🛡️</button>
        
        <template v-if="gameState === 'FIGHT' || gameState === 'TRAINING'">
          <button class="action-btn intercept" @touchstart.prevent="dispatchIntercept(true)" @touchend.prevent="dispatchIntercept(false)" @touchcancel.prevent="dispatchIntercept(false)">🏃</button>
          <button class="action-btn ultimate" @touchstart.prevent="dispatchKeyEvent('ultimate', true)" @touchend.prevent="dispatchKeyEvent('ultimate', false)" @touchcancel.prevent="dispatchKeyEvent('ultimate', false)">⚡</button>
          <button class="action-btn burst" @touchstart.prevent="dispatchKeyEvent('burst', true)" @touchend.prevent="dispatchKeyEvent('burst', false)" @touchcancel.prevent="dispatchKeyEvent('burst', false)">💥</button>
        </template>

        <button v-if="gameState === 'LOBBY'" class="action-btn interact" @touchstart.prevent="dispatchKeyEvent('enter', true)" @touchend.prevent="dispatchKeyEvent('enter', false)" @touchcancel.prevent="dispatchKeyEvent('enter', false)">OK</button>
      </div>
    </div>

    <!-- GLOBAL BROADCAST MARQUEE -->
    <div v-if="globalBroadcastMessage" class="global-broadcast">
      <div class="marquee-text">{{ globalBroadcastMessage }}</div>
    </div>
  </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted, reactive, computed, watch } from 'vue';
import { GameEngine } from '../game/GameEngine';
import { Player } from '../game/Player';
import { audioManager } from '../game/AudioManager.js';
import { networkManager } from '../game/NetworkManager.js';
import { LobbyEngine } from '../game/LobbyEngine.js';
import { SKINS_DB } from '../game/SkinsDB';

// 'LOBBY', 'TUTORIAL', 'MULTIPLAYER_LOBBY', 'CHAR_SELECT', 'FIGHT'
// 'AUTH', 'LOBBY', 'TUTORIAL', 'MULTIPLAYER_LOBBY', 'CHAR_SELECT', 'FIGHT'
const gameState = ref('AUTH');
const isVsCPU = ref(false);
const isOnline = ref(true); // Default to online for lobby
const isSpectator = ref(false);
const spectatorSlots = ref({});
const showSpectateModal = ref(false);

const p1Choice = ref('Striker');
const p2Choice = ref('Assassin');

const gameCanvas = ref(null);
const lobbyCanvas = ref(null);
let engine = null;
let lobbyEngine = null;
let lobbyUpdateTimer = null;

// Settings Panel
const showSettings = ref(false);
const sfxVol = ref(parseFloat(localStorage.getItem('sfxVolume') ?? '0.8'));
const bgmVol = ref(parseFloat(localStorage.getItem('bgmVolume') ?? '0.5'));
const isMuted = ref(localStorage.getItem('audioMuted') === 'true');

// Key Rebinding
const defaultControls = { left: 'a', right: 'd', up: 'w', down: 's', defend: 'shift', attack: ' ', skill: 'f', diveKick: 'q', counter: 'r', burst: 'g', ultimate: 'e', emote: 't', pursuit: 'c', intercept: 'x', sweep: 'v' };
const keyBindings = ref((() => {
  const stored = localStorage.getItem('keyBindings');
  if (stored) {
    const parsed = JSON.parse(stored);
    if (!parsed.down || parsed.defend === 's') {
      localStorage.removeItem('keyBindings');
      return { ...defaultControls };
    }
    return parsed;
  }
  return { ...defaultControls };
})());
const rebindingKey = ref(null); // Which action is being rebound

// Skin Shop Mannequin
const mannequinCanvas = ref(null);
let mannequinAnimationId = null;
let mannequinPlayer = null;

// Auth State
const isLoginMode = ref(true);
const authUsername = ref('');
const authPassword = ref('');
const authError = ref('');
const loggedInUsername = ref('');

// Global Chat
const chatMessages = ref([]);
const chatInput = ref('');
const isChatFocused = ref(false);
const chatContainerRef = ref(null);
const chatInputRef = ref(null);

const sendChatMessage = () => {
  if (chatInput.value.trim() !== '') {
    networkManager.sendChatMessage(chatInput.value.trim());
    chatInput.value = '';
  }
  isChatFocused.value = false;
  if (chatInputRef.value) chatInputRef.value.blur();
};

// Leaderboard State
const showLeaderboardModal = ref(false);
const leaderboardData = ref([]);
const leaderboardTab = ref('trophies'); // 'trophies' or 'time'

const sortedLeaderboard = computed(() => {
  if (leaderboardTab.value === 'trophies') {
    return [...leaderboardData.value].sort((a, b) => b.trophies - a.trophies).slice(0, 50);
  } else {
    return [...leaderboardData.value].sort((a, b) => b.playTime - a.playTime).slice(0, 50);
  }
});

const fetchLeaderboard = () => {
  if (networkManager && networkManager.socket) {
    networkManager.socket.emit('getLeaderboard');
  }
  showLeaderboardModal.value = true;
};

// Admin State
const showAdminLogin = ref(false);
const showAdminDashboard = ref(false);
const adminPasswordInput = ref('');
const allUsers = ref([]);
const onlineUsers = computed(() => allUsers.value.filter(u => u.isOnline));
const adminActiveTab = ref('online');

const opponentUsername = ref('Opponent');

// User Progression State
const unlockedChars = ref(['Striker']);
const charLevels = ref({ Striker: 1 });
const cpuMatches = ref(0);
const tokens = ref(0); // Used for Gacha
const goldCoins = ref(0);
const trophies = ref(0); // Used for Equipment Shop
watch(trophies, (newVal) => {
  if (typeof lobbyEngine !== 'undefined' && lobbyEngine && lobbyEngine.localPlayer) {
    lobbyEngine.localPlayer.trophies = newVal;
    if (typeof networkManager !== 'undefined' && networkManager && networkManager.socket) {
      networkManager.socket.emit('lobbyUpdate', {
        x: lobbyEngine.localPlayer.x,
        y: lobbyEngine.localPlayer.y,
        facing: lobbyEngine.localPlayer.facing,
        color: lobbyEngine.localPlayer.color,
        characterType: lobbyEngine.localPlayer.characterType,
        skinId: lobbyEngine.localPlayer.skinId,
        trophies: newVal
      });
    }
  }
});
const charPlayTime = ref({}); // Tracks play time in minutes per character
const playerEquipment = ref({ defense: 0, attack: 0, maxHp: 0 });
const quests = ref({ parries: 0, cpuDefeated: 0, ultimatesHit: 0, skillsUsed: 0, totalWins: 0, perfectWins: 0 });

const showMilestoneCelebration = ref(false);
const milestoneType = ref(0);
const globalBroadcastMessage = ref('');
let globalBroadcastTimer = null;

const unlockedSkins = ref([]);
const equippedSkins = ref({});
const currentSkinIndex = ref({ Striker: 0, Brawler: 0, Assassin: 0, Tank: 0, Ninja: 0, Sniper: 0, Mage: 0 });

const getSelectedSkin = (charName) => {
  const skins = SKINS_DB[charName];
  if (!skins) return { id: 'default', name: '預設 (Default)', color: '#fff', price: 0 };
  return skins[currentSkinIndex.value[charName] || 0];
};

const nextSkin = (charName) => {
  const skins = SKINS_DB[charName];
  if (skins) currentSkinIndex.value[charName] = (currentSkinIndex.value[charName] + 1) % skins.length;
};

const prevSkin = (charName) => {
  const skins = SKINS_DB[charName];
  if (skins) currentSkinIndex.value[charName] = (currentSkinIndex.value[charName] - 1 + skins.length) % skins.length;
};

const hasSkin = (charName, skinId) => {
  if (skinId === 'default') return true;
  if (skinId === 'champion') return trophies.value >= 1000;
  if (skinId === 'grandmaster') return trophies.value >= 2000;
  return unlockedSkins.value.includes(`${charName}_${skinId}`);
};

const isSkinEquipped = (charName, skinId) => {
  if (skinId === 'default') {
    return !equippedSkins.value[charName] || equippedSkins.value[charName] === 'default';
  }
  return equippedSkins.value[charName] === skinId;
};

const equipSkin = (charName) => {
  const skin = getSelectedSkin(charName);
  if (skin && hasSkin(charName, skin.id)) {
    equippedSkins.value[charName] = skin.id;
    saveProgress();
    
    // Immediately update the lobby character so you see it walking around!
    if (typeof lobbyEngine !== 'undefined' && lobbyEngine && lobbyEngine.localPlayer) {
      lobbyEngine.localPlayer.skinId = skin.id;
      lobbyEngine.localPlayer.color = skin.color;
      // Also notify server to broadcast skin update
      if (typeof networkManager !== 'undefined' && networkManager && networkManager.socket) {
        networkManager.socket.emit('lobbyUpdate', {
          x: lobbyEngine.localPlayer.x,
          y: lobbyEngine.localPlayer.y,
          facing: lobbyEngine.localPlayer.facing,
          color: skin.color,
          characterType: lobbyEngine.localPlayer.characterType,
          skinId: skin.id
        });
      }
    }
  }
};

const buySkin = (charName) => {
  const skin = getSelectedSkin(charName);
  if (skin && skin.id !== 'default' && !hasSkin(charName, skin.id)) {
    if (tokens.value >= skin.price) {
      tokens.value -= skin.price;
      unlockedSkins.value.push(`${charName}_${skin.id}`);
      equipSkin(charName);
      showSystemMessage(`成功購買並裝備造型: ${skin.name}`);
    } else {
      alert("Tokens (抽獎代幣) 不足！");
    }
  }
};

const getEquippedSkinColor = (charName) => {
  const skinId = equippedSkins.value[charName] || 'default';
  const skins = SKINS_DB[charName];
  if (!skins) return '#fff';
  const skin = skins.find(s => s.id === skinId);
  return skin ? skin.color : '#fff';
};

const openSkinShop = () => {
  gameState.value = 'SKIN_SHOP';
  // Wait for canvas to mount
  setTimeout(() => {
    startMannequinLoop();
  }, 100);
};

const leaveSkinShop = () => {
  if (mannequinAnimationId) {
    cancelAnimationFrame(mannequinAnimationId);
    mannequinAnimationId = null;
  }
  mannequinPlayer = null;
  resumeLobby();
};

const startMannequinLoop = () => {
  if (!mannequinCanvas.value) return;
  const ctx = mannequinCanvas.value.getContext('2d');
  
  const loop = () => {
    if (gameState.value !== 'SKIN_SHOP') return;
    
    ctx.clearRect(0, 0, mannequinCanvas.value.width, mannequinCanvas.value.height);
    
    // Draw background
    ctx.fillStyle = '#2f3640';
    ctx.fillRect(0, 0, mannequinCanvas.value.width, mannequinCanvas.value.height);
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(0, 300, mannequinCanvas.value.width, 100); // Floor

    if (!mannequinPlayer || mannequinPlayer.characterType !== p1Choice.value || mannequinPlayer.skinId !== (getSelectedSkin(p1Choice.value)?.id || 'default')) {
      const skinId = getSelectedSkin(p1Choice.value)?.id || 'default';
      const skinColor = getSelectedSkin(p1Choice.value)?.color || '#fff';
      mannequinPlayer = new Player(125, 200, skinColor, {}, 1, p1Choice.value, true, 1, undefined, skinId, trophies.value);
      mannequinPlayer.isGrounded = true;
    }
    
    // Ensure trophies are always synced even if mannequin isn't recreated
    mannequinPlayer.trophies = trophies.value;
    
    mannequinPlayer.draw(ctx);
    
    mannequinAnimationId = requestAnimationFrame(loop);
  };
  loop();
};

const dailyQuestPool = [
  { id: 'daily_cpu_3', desc: '每日: 打贏人機 3 場', target: 3, type: 'cpuDefeated' },
  { id: 'daily_cpu_5', desc: '每日: 打贏人機 5 場', target: 5, type: 'cpuDefeated' },
  { id: 'daily_parry_15', desc: '每日: 成功格擋 15 次', target: 15, type: 'parries' },
  { id: 'daily_parry_30', desc: '每日: 成功格擋 30 次', target: 30, type: 'parries' },
  { id: 'daily_ult_5', desc: '每日: 累計大招命中 5 次', target: 5, type: 'ultimatesHit' },
  { id: 'daily_skills_20', desc: '每日: 累計使用技能 20 次', target: 20, type: 'skillsUsed' },
  { id: 'daily_win_5', desc: '每日: 對戰獲勝 5 場 (含線上)', target: 5, type: 'totalWins' },
  { id: 'daily_perfect_1', desc: '每日: 滿血獲勝 1 次', target: 1, type: 'perfectWins' }
];

const dailyQuests = ref([]);
const lastDailyDate = ref('');
const hasUsedDailyRefresh = ref(false);

const refreshDailyQuest = (idx) => {
  if (hasUsedDailyRefresh.value) return;
  const currentIds = dailyQuests.value.map(q => q.id);
  const availableQuests = dailyQuestPool.filter(q => !currentIds.includes(q.id));
  if (availableQuests.length > 0) {
    const newQuest = availableQuests[Math.floor(Math.random() * availableQuests.length)];
    dailyQuests.value[idx] = { ...newQuest, progress: 0, done: false };
    hasUsedDailyRefresh.value = true;
    saveProgress();
  }
};

const areAllQuestsDone = computed(() => 
  unlockedChars.value.includes('Brawler') && 
  unlockedChars.value.includes('Sniper') && 
  unlockedChars.value.includes('Mage')
);
const systemMessage = ref('');
const showGachaModal = ref(false);
const showQuestModal = ref(false);

const closeQuestModal = () => {
  showQuestModal.value = false;
  if (lobbyEngine && lobbyEngine.localPlayer) {
    lobbyEngine.localPlayer.isReadingQuest = false;
  }
};
const gachaResult = ref(null);
const isRollingGacha = ref(false);
let systemMessageTimer = null;

const charData = {
  'Striker': { skill: 'Fireball (F)', skill2: 'Fireball (Shift)' },
  'Assassin': { skill: 'Shield Bubble (F)', skill2: 'Shield Bubble (Shift)' },
  'Ninja': { skill: 'Teleport (F)', skill2: 'Teleport (Shift)' },
  'Tank': { skill: 'Ground Smash (F)', skill2: 'Ground Smash (Shift)' },
  'Brawler': { skill: 'Dash Punch (F)', skill2: 'Dash Punch (Shift)' },
  'Sniper': { skill: 'Gunshot (F)', skill2: 'Gunshot (Shift)' },
  'Mage': { skill: 'Homing Magic (F)', skill2: 'Homing Magic (Shift)' }
};

const showSystemMessage = (msg) => {
  systemMessage.value = msg;
  if (systemMessageTimer) clearTimeout(systemMessageTimer);
  systemMessageTimer = setTimeout(() => {
    systemMessage.value = '';
  }, 3000);
};

const saveProgress = async () => {
  const data = {
    unlockedChars: unlockedChars.value,
    charLevels: charLevels.value,
    cpuMatches: cpuMatches.value,
    tokens: tokens.value,
    goldCoins: goldCoins.value,
    trophies: trophies.value,
    charPlayTime: charPlayTime.value,
    playerEquipment: playerEquipment.value,
    quests: quests.value,
    unlockedSkins: unlockedSkins.value,
    equippedSkins: equippedSkins.value,
    dailyQuests: dailyQuests.value,
    lastDailyDate: lastDailyDate.value,
    hasUsedDailyRefresh: hasUsedDailyRefresh.value
  };
  
  try {
    await fetch('/api/syncProgress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: authUsername.value,
        password: authPassword.value,
        progress: data
      })
    });
  } catch (e) {
    console.error('Failed to sync progress', e);
  }
};

const handleAuth = async () => {
  if (!authUsername.value || !authPassword.value) {
    authError.value = "Username and password required.";
    return;
  }
  
  authError.value = "";
  const endpoint = isLoginMode.value ? '/api/login' : '/api/register';
  
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: authUsername.value, password: authPassword.value })
    });
    const data = await res.json();
    
    if (!res.ok) {
      authError.value = data.error;
      return;
    }
    
    loggedInUsername.value = authUsername.value;
    
    // Apply loaded progress
    if (data.progress) {
      unlockedChars.value = data.progress.unlockedChars || ['Striker'];
      charLevels.value = data.progress.charLevels || {};
      
      // Retroactively add level 1 for any unlocked char that doesn't have a level
      unlockedChars.value.forEach(char => {
        if (!charLevels.value[char]) charLevels.value[char] = 1;
      });

      cpuMatches.value = data.progress.cpuMatches || 0;
      tokens.value = data.progress.tokens || 0;
      goldCoins.value = data.progress.goldCoins || 0;
      trophies.value = data.progress.trophies || 0;
      charPlayTime.value = data.progress.charPlayTime || {};
      playerEquipment.value = data.progress.playerEquipment || { defense: 0, attack: 0, maxHp: 0 };
      unlockedSkins.value = data.progress.unlockedSkins || [];
      equippedSkins.value = data.progress.equippedSkins || {};
      quests.value = {
        parries: data.progress.quests?.parries || 0,
        cpuDefeated: data.progress.quests?.cpuDefeated || 0,
        ultimatesHit: data.progress.quests?.ultimatesHit || 0,
        skillsUsed: data.progress.quests?.skillsUsed || 0,
        totalWins: data.progress.quests?.totalWins || 0,
        perfectWins: data.progress.quests?.perfectWins || 0
      };

      const today = new Date().toDateString();
      if (data.progress.lastDailyDate !== today) {
         // Reset daily quests
         const pool = [...dailyQuestPool].sort(() => 0.5 - Math.random());
         dailyQuests.value = pool.slice(0, 3).map(q => ({ ...q, progress: 0, done: false }));
         lastDailyDate.value = today;
         hasUsedDailyRefresh.value = false;
         saveProgress(); // Save the new daily quests
      } else {
         dailyQuests.value = data.progress.dailyQuests || [];
         lastDailyDate.value = data.progress.lastDailyDate || today;
         hasUsedDailyRefresh.value = data.progress.hasUsedDailyRefresh || false;
      }
    }
    
    // Enter Lobby
    gameState.value = 'LOBBY';
    setTimeout(() => {
      initLobby();
      
      // Update server with real username now that we are logged in
      networkManager.joinLobby({
        username: loggedInUsername.value,
        x: 100, y: 100, facing: 1, color: '#ff9f43', characterType: p1Choice.value, trophies: trophies.value
      });
    }, 100);
    
  } catch (e) {
    authError.value = "Server connection failed.";
  }
};

// Lobby specific UI state
const joinRoomCode = ref('');
const hasOpponent = ref(false);

const p1Health = ref(100);
const p1MaxHealth = ref(100);
const p2Health = ref(100);
const p2MaxHealth = ref(100);
const gameTimer = ref(99);
const engineDebug = reactive({ running: '?', entities: 0, roundStarting: '?', gameOver: '?' });
const gameOver = ref(false);
const resultText = ref('');
const roundStartText = ref('');
const isTouchDevice = ref(false);

const remoteReady = ref(false);
const localReady = ref(false);
const isCinematicActive = ref(false);
const remoteRematchReady = ref(false);
const localRematchReady = ref(false);

const isHostClient = computed(() => isOnline.value ? networkManager.isHost : true);

const onlineState = reactive({
  roomCode: null,
  error: null,
});
const joinCodeInput = ref('');

let p1 = null;
let p2 = null;

const buyEquipment = (type, cost, amount = 1) => {
  if (goldCoins.value >= cost) {
    goldCoins.value -= cost;
    playerEquipment.value[type] += amount;
    showSystemMessage(`購買成功！`);
    saveProgress();
  }
};

const buyMaxEquipment = (type, cost, unitAmount = 1) => {
  const maxUpgrades = Math.floor(goldCoins.value / cost);
  if (maxUpgrades > 0) {
    goldCoins.value -= maxUpgrades * cost;
    playerEquipment.value[type] += maxUpgrades * unitAmount;
    showSystemMessage(`購買成功！(一次升級 ${maxUpgrades} 次)`);
    saveProgress();
  }
};

const rollGacha = () => {
  if (tokens.value < 20 || isRollingGacha.value) return;
  
  isRollingGacha.value = true;
  gachaResult.value = null;
  
  setTimeout(() => {
    // All characters are in the Gacha pool!
    const gachaPool = Object.keys(charData);
    const available = gachaPool.filter(c => {
      const isUnlocked = unlockedChars.value.includes(c);
      const level = charLevels.value[c] || 0;
      return !isUnlocked || level < 5;
    });
    
    tokens.value -= 20;
    
    if (available.length === 0) {
      gachaResult.value = 'ALL CHARACTERS ARE MAX LEVEL!';
    } else {
      const rolled = available[Math.floor(Math.random() * available.length)];
      if (!unlockedChars.value.includes(rolled)) {
        unlockedChars.value.push(rolled);
        charLevels.value[rolled] = 1;
        gachaResult.value = `🎉 YOU GOT ${rolled.toUpperCase()}! 🎉`;
      } else {
        charLevels.value[rolled]++;
        gachaResult.value = `⭐ ${rolled.toUpperCase()} UPGRADED TO LEVEL ${charLevels.value[rolled]}! ⭐`;
      }
    }
    
    saveProgress();
    isRollingGacha.value = false;
  }, 1500); // 1.5s rolling animation
};

const p1CD = ref({ skill: true, skillTimer: 0, diveKick: true, diveKickTimer: 0, counter: true, counterTimer: 0, pursuit: true, pursuitTimer: 0, sweep: true, sweepTimer: 0, defend: true, defendTimer: 0, burst: true, burstTimer: 0 });
const p2CD = ref({ skill: true, skillTimer: 0, diveKick: true, diveKickTimer: 0, counter: true, counterTimer: 0, pursuit: true, pursuitTimer: 0, sweep: true, sweepTimer: 0, defend: true, defendTimer: 0, burst: true, burstTimer: 0, hasBurst: false });

const p1BlockCount = ref(0);
const p1UltimateReady = ref(false);
const p2BlockCount = ref(0);
const p2UltimateReady = ref(false);


const cancelJoinRoom = () => {
  lobbyError.value = '';
  resumeLobby();
};

// ===== SETTINGS FUNCTIONS =====
const updateBgmVolume = () => { audioManager.bgmVolume = bgmVol.value; };
const updateSfxVolume = () => { audioManager.sfxVolume = sfxVol.value; };
const toggleMuteAll = () => { isMuted.value = audioManager.toggleMute(); };

const actionLabels = {
  left: '⬅️ 左移', right: '➡️ 右移', up: '⬆️ 跳躍', down: '⬇️ 下蹲', defend: '🛡️ 防禦',
  attack: '👊 攻擊', skill: '🔥 技能', diveKick: '💢 俯衝踢', counter: '🔄 反擊',
  burst: '💥 爆發', ultimate: '⚡ 必殺', emote: '😀 表情', pursuit: '🏃 追擊',
  intercept: '🚫 攔截', sweep: '🦵 掃腿'
};
const getActionLabel = (action) => actionLabels[action] || action;
const formatKey = (key) => {
  if (key === ' ') return 'SPACE';
  if (key === 'shift') return 'SHIFT';
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  if (key === 'ArrowLeft') return '←';
  if (key === 'ArrowRight') return '→';
  return key.toUpperCase();
};

// --- Mobile Virtual Joystick & Input ---
const joystick = reactive({ active: false, originX: 0, originY: 0, currentX: 0, currentY: 0, deltaX: 0, deltaY: 0 });

const setSimulatedKey = (actionName, isDown) => {
  let key = keyBindings.value[actionName];
  if (actionName === 'enter') key = 'enter';
  if (!key) return;

  // Direct injection for movement keys
  if (gameState.value === 'LOBBY' && lobbyEngine && lobbyEngine.localPlayer) {
    lobbyEngine.localPlayer.keys[key.toLowerCase()] = isDown;
  }
  if (engine && engine.isRunning) {
    if (p1 && p1.isLocalPlayer) p1.keys[key.toLowerCase()] = isDown;
    if (p2 && p2.isLocalPlayer) p2.keys[key.toLowerCase()] = isDown;
  }
};

const dispatchKeyEvent = (actionName, isDown) => {
  let key = keyBindings.value[actionName];
  if (actionName === 'enter') key = 'Enter';
  if (!key) return;

  const event = new KeyboardEvent(isDown ? 'keydown' : 'keyup', {
    key: key,
    code: key === ' ' ? 'Space' : 'Key' + key.toUpperCase(),
    bubbles: true
  });
  window.dispatchEvent(event);
};

const dispatchIntercept = (isDown) => {
  dispatchKeyEvent('skill', isDown);
  dispatchKeyEvent('up', isDown);
};

// Dynamic Screen Scaling
const windowSize = reactive({ width: window.innerWidth, height: window.innerHeight });
const onResize = () => {
  windowSize.width = window.innerWidth;
  windowSize.height = window.innerHeight;
};

const wrapperStyle = computed(() => {
  const targetRatio = 1024 / 576;
  const currentRatio = windowSize.width / windowSize.height;
  
  let scale = 1;
  if (currentRatio > targetRatio) {
    scale = windowSize.height / 576;
  } else {
    scale = windowSize.width / 1024;
  }
  
  return {
    position: 'relative',
    width: '1024px',
    height: '576px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    transform: `scale(${scale})`,
    transformOrigin: 'center center'
  };
});

const handleTouchStart = (e) => {
  const touch = e.changedTouches[0];
  joystick.active = true;
  joystick.originX = touch.clientX;
  joystick.originY = touch.clientY;
  joystick.currentX = touch.clientX;
  joystick.currentY = touch.clientY;
  updateJoystickKeys();
};

const handleTouchMove = (e) => {
  if (!joystick.active) return;
  const touch = Array.from(e.touches).find(t => t.identifier === e.changedTouches[0].identifier) || e.touches[0];
  if (!touch) return;
  
  joystick.currentX = touch.clientX;
  joystick.currentY = touch.clientY;
  
  const targetRatio = 1024 / 576;
  const currentRatio = windowSize.width / windowSize.height;
  const scale = currentRatio > targetRatio ? windowSize.height / 576 : windowSize.width / 1024;
  
  const dx = (joystick.currentX - joystick.originX) / scale;
  const dy = (joystick.currentY - joystick.originY) / scale;
  const distance = Math.sqrt(dx*dx + dy*dy);
  const maxRadius = 50;
  
  if (distance > maxRadius) {
    joystick.deltaX = (dx / distance) * maxRadius;
    joystick.deltaY = (dy / distance) * maxRadius;
  } else {
    joystick.deltaX = dx;
    joystick.deltaY = dy;
  }
  updateJoystickKeys();
};

const handleTouchEnd = (e) => {
  if (e.touches.length === 0 || !Array.from(e.touches).some(t => t.clientX < window.innerWidth / 2)) {
    joystick.active = false;
    joystick.deltaX = 0;
    joystick.deltaY = 0;
    setSimulatedKey('up', false);
    setSimulatedKey('down', false);
    setSimulatedKey('left', false);
    setSimulatedKey('right', false);
  }
};

const updateJoystickKeys = () => {
  const threshold = 20;
  // X axis
  if (joystick.deltaX < -threshold) { setSimulatedKey('left', true); setSimulatedKey('right', false); }
  else if (joystick.deltaX > threshold) { setSimulatedKey('right', true); setSimulatedKey('left', false); }
  else { setSimulatedKey('left', false); setSimulatedKey('right', false); }
  // Y axis
  if (joystick.deltaY < -threshold) { setSimulatedKey('up', true); setSimulatedKey('down', false); }
  else if (joystick.deltaY > threshold) { setSimulatedKey('down', true); setSimulatedKey('up', false); }
  else { setSimulatedKey('up', false); setSimulatedKey('down', false); }
};
// ---------------------------------------

const startRebind = (action) => {
  rebindingKey.value = action;
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    let key = e.key;
    // Normalize keys
    if (key === 'Shift') key = 'shift';
    else if (key === 'Control') key = 'control';
    else if (key === 'Alt') key = 'alt';
    else key = key.toLowerCase();
    keyBindings.value[action] = key;
    localStorage.setItem('keyBindings', JSON.stringify(keyBindings.value));
    rebindingKey.value = null;
    window.removeEventListener('keydown', handler, true);
  };
  window.addEventListener('keydown', handler, true);
};

const resetKeyBindings = () => {
  keyBindings.value = { ...defaultControls };
  localStorage.setItem('keyBindings', JSON.stringify(keyBindings.value));
};

// Character Preview
const previewChar = ref(null);
const getPassiveDesc = (name) => {
  const descs = {
    Striker: '🔥 鬥志燃燒 — 連擊≥5時攻擊+15%',
    Brawler: '💢 狂戰士之怒 — HP<30%時攻擊+25%',
    Assassin: '👤 影遁 — 技能後1秒無敵',
    Tank: '🛡️ 鐵壁 — 受傷反彈5%傷害',
    Ninja: '⚡ 忍者之道 — HP<30%時移速+30%',
    Sniper: '🎯 精準射擊 — 目標HP<20%時+50%傷害',
    Mage: '✨ 魔力湧動 — 技能命中減CD 2秒'
  };
  return descs[name] || '';
};
const getCharStats = (name) => {
  const stats = {
    Striker: { hp: 100, speed: 300 }, Brawler: { hp: 100, speed: 300 },
    Assassin: { hp: 100, speed: 400 }, Tank: { hp: 100, speed: 300 },
    Ninja: { hp: 100, speed: 500 }, Sniper: { hp: 100, speed: 300 },
    Mage: { hp: 100, speed: 300 }
  };
  return stats[name] || { hp: 100, speed: 300 };
};

// ===== SOCIAL SYSTEM STATE =====
const showFriends = ref(false);
const showClan = ref(false);
const friendList = ref([]);
const friendRequests = ref([]);
const friendSearchInput = ref('');
const battleInvite = ref(null);

const myClan = ref(null);
const clanList = ref([]);
const newClanName = ref('');
const newClanDesc = ref('');

const toggleFriends = () => {
  showFriends.value = !showFriends.value;
  if (showFriends.value) {
    networkManager.socket?.emit('friend:getList');
  }
};

const toggleClan = () => {
  showClan.value = !showClan.value;
  if (showClan.value) {
    networkManager.socket?.emit('clan:getInfo');
    networkManager.socket?.emit('clan:getList');
  }
};

const sendFriendRequest = () => {
  if (!friendSearchInput.value.trim()) return;
  networkManager.socket?.emit('friend:request', friendSearchInput.value.trim());
  friendSearchInput.value = '';
};

const acceptFriend = (name) => { networkManager.socket?.emit('friend:accept', name); };
const declineFriend = (name) => { networkManager.socket?.emit('friend:decline', name); };
const removeFriend = (name) => { networkManager.socket?.emit('friend:remove', name); };
const inviteFriend = (name) => { networkManager.socket?.emit('friend:invite', name); };

const acceptBattleInvite = () => {
  // Navigate to the inviter's game
  battleInvite.value = null;
  // Could join their room - for now just show notification
};

const createClan = () => {
  if (!newClanName.value.trim()) return;
  networkManager.socket?.emit('clan:create', { name: newClanName.value.trim(), description: newClanDesc.value.trim() });
  newClanName.value = '';
  newClanDesc.value = '';
};

const joinClan = (name) => { networkManager.socket?.emit('clan:join', name); };
const leaveClan = () => { networkManager.socket?.emit('clan:leave'); };

// Clan Chat
const clanChatMessages = ref([]);
const clanChatInput = ref('');
const clanChatRef = ref(null);

const invitablePlayers = ref([]);

const fetchInvitablePlayers = () => {
  networkManager.socket?.emit('clan:getInvitablePlayers');
};

const inviteToClan = (targetUsername) => {
  networkManager.inviteToClan(targetUsername);
  alert(`已發送戰隊邀請給 ${targetUsername}`);
};

const sendClanChat = () => {
  if (!clanChatInput.value.trim()) return;
  networkManager.socket?.emit('clan:chat', clanChatInput.value.trim());
  clanChatInput.value = '';
};

const shareToClan = () => {
  if (!engine?.replayRecorder?.frames?.length) {
    alert('沒有可分享的回放！先打完一場再分享');
    return;
  }
  const data = engine.replayRecorder.getReplayData();
  networkManager.socket?.emit('clan:shareReplay', data);
};

const downloadSharedReplay = (replayData) => {
  if (!replayData) return;
  const blob = new Blob([JSON.stringify(replayData)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clan_replay_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Replay helpers
const downloadReplay = () => {
  if (engine?.replayRecorder) {
    engine.replayRecorder.downloadReplay(`replay_${Date.now()}.json`);
  }
};
const shareReplay = async () => {
  if (engine?.replayRecorder) {
    const ok = await engine.replayRecorder.shareReplay();
    if (ok) alert('回放資料已複製到剪貼板！');
  }
};


onMounted(() => {
  window.addEventListener('resize', onResize);
  isTouchDevice.value = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  setupNetworking();
  
  window.addEventListener('keydown', (e) => {
    if (engine && engine.isRunning && !isChatFocused.value) {
      if (engine.handleKeyDown) engine.handleKeyDown(e.key);
    }
    
    // Global Chat Hotkey (/)
    if (e.key === '/') {
      if (gameState.value === 'AUTH') return;
      
      if (!isChatFocused.value) {
        isChatFocused.value = true;
        e.preventDefault(); // Prevent '/' from being typed
        setTimeout(() => {
          if (chatInputRef.value) chatInputRef.value.focus();
        }, 10);
      }
    } else if (e.key === 'Enter') {
      if (isChatFocused.value) {
        sendChatMessage();
        e.preventDefault();
      } else if (gameState.value === 'LOBBY' && lobbyEngine && lobbyEngine.localPlayer && !lobbyEngine.localPlayer.isEnteringPortal) {
        // Synchronous check for discord portal to bypass Safari popup blockers
        const discordPortal = lobbyEngine.portals.find(p => p.id === 'discord' && p.floor === lobbyEngine.currentFloor);
        if (discordPortal && Math.abs(lobbyEngine.localPlayer.x - discordPortal.x) < 50) {
          window.open('https://discord.gg/FuCHvKaqaN', '_blank');
        }
      }
    } else if (e.key === 'Escape') {
      if (isChatFocused.value) {
        isChatFocused.value = false;
        if (chatInputRef.value) chatInputRef.value.blur();
      }
    }
  });

  window.addEventListener('keyup', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (lobbyEngine) lobbyEngine.stop();
  if (engine) engine.stop();
  window.removeEventListener('keyup', handleGlobalKeydown);
  if (networkManager) networkManager.disconnect();
});

const handleGlobalKeydown = (e) => {
  if (gameState.value === 'LOBBY' && !showGachaModal.value && !showAdminLogin.value && !showAdminDashboard.value) {
    if (e.code === 'Backquote' || e.key === '`' || e.key === '·') {
      e.preventDefault();
      showAdminLogin.value = true;
      return;
    }
  }
};





const initLobby = () => {
  audioManager.init();
  audioManager.resume();
  
  if (!lobbyCanvas.value) return;
  
  // Dispose old engine if it exists
  if (lobbyEngine) {
    if (lobbyEngine.dispose) {
      lobbyEngine.dispose();
    } else {
      lobbyEngine.stop();
    }
    lobbyEngine = null;
  }
  
  lobbyEngine = new LobbyEngine(lobbyCanvas.value);
  if (leaderboardData.value && leaderboardData.value.length > 0) {
    lobbyEngine.setLeaderboardData(leaderboardData.value);
  }
  
  const playerColor = getEquippedSkinColor(p1Choice.value);
  const player = new Player(100, 100, playerColor, keyBindings.value, 1, p1Choice.value, false, charLevels.value[p1Choice.value] || 1, undefined, equippedSkins.value[p1Choice.value] || 'default', trophies.value);
  player.isOnline = true;
  player.isLocalPlayer = true;
  player.username = loggedInUsername.value;
  lobbyEngine.setLocalPlayer(player);
  
  lobbyEngine.onInteract = (action, slotId) => {
    if (action === 'join_arcade') {
      isOnline.value = true;
      isVsCPU.value = false;
      networkManager.joinSlot(slotId);
      if (lobbyEngine) lobbyEngine.stop();
    } else if (action === 'training') {
      isVsCPU.value = true;
      isOnline.value = false;
      gameState.value = 'CHAR_SELECT';
      if (lobbyEngine) lobbyEngine.stop();
    } else if (action === 'tutorial') {
      gameState.value = 'TUTORIAL';
      if (lobbyEngine) lobbyEngine.stop();
    } else if (action === 'gacha') {
      showGachaModal.value = true;
    } else if (action === 'quests') {
      showQuestModal.value = true;
    } else if (action === 'shop') {
      gameState.value = 'SHOP';
      if (lobbyEngine) lobbyEngine.stop();
    } else if (action === 'skin_shop') {
      gameState.value = 'SKIN_SHOP';
      if (lobbyEngine) lobbyEngine.stop();
      openSkinShop();
    }
  };
  
  lobbyEngine.start();
  
  if (lobbyUpdateTimer) clearInterval(lobbyUpdateTimer);
  
  // Send lobby updates
  lobbyUpdateTimer = setInterval(() => {
    if (gameState.value === 'LOBBY' && lobbyEngine && lobbyEngine.localPlayer && networkManager.socket) {
      const p = lobbyEngine.localPlayer;
      p.trophies = trophies.value;
      networkManager.sendLobbyUpdate({
        x: p.x,
        y: p.y,
        z: p.z || 0,
        facing: p.facing,
        color: p.color,
        characterType: p.characterType,
        skinId: p.skinId,
        username: loggedInUsername.value,
        trophies: trophies.value
      });
    }
  }, 1000 / 30);
};

const setupNetworking = () => {
  // Empty URL means it will connect to the host that served the page
  networkManager.connect();
  
  // Lobby join
  networkManager.socket.on('connect', () => {
    networkManager.joinLobby({
      username: loggedInUsername.value,
      x: 100, y: 100, facing: 1, color: '#ff9f43', characterType: p1Choice.value, trophies: trophies.value
    });
  });

  // Friend socket events
  networkManager.socket.on('friend:list', (data) => {
    friendList.value = data.friends;
    friendRequests.value = data.requests;
  });
  networkManager.socket.on('friend:requestSent', () => { /* ok */ });
  networkManager.socket.on('friend:newRequest', (from) => {
    friendRequests.value.push(from);
  });
  networkManager.socket.on('friend:accepted', () => {
    networkManager.socket.emit('friend:getList');
  });
  networkManager.socket.on('friend:declined', () => {
    networkManager.socket.emit('friend:getList');
  });
  networkManager.socket.on('friend:removed', () => {
    networkManager.socket.emit('friend:getList');
  });
  networkManager.socket.on('friend:error', (msg) => { alert(msg); });
  networkManager.socket.on('friend:battleInvite', (data) => {
    battleInvite.value = data;
    setTimeout(() => { if (battleInvite.value === data) battleInvite.value = null; }, 15000);
  });

  // Clan socket events
  networkManager.socket.on('clan:info', (data) => { myClan.value = data; });
  networkManager.socket.on('clan:list', (data) => { clanList.value = data; });
  networkManager.socket.on('clan:created', () => {
    networkManager.socket.emit('clan:getInfo');
    networkManager.socket.emit('clan:getList');
  });
  networkManager.socket.on('clan:joined', () => {
    networkManager.socket.emit('clan:getInfo');
    networkManager.socket.emit('clan:getList');
  });
  networkManager.socket.on('clan:left', () => {
    myClan.value = null;
    networkManager.socket.emit('clan:getList');
  });
  networkManager.socket.on('clan:error', (msg) => { alert(msg); });
  networkManager.socket.on('clan:chatMsg', (msg) => {
    clanChatMessages.value.push(msg);
    if (clanChatMessages.value.length > 100) clanChatMessages.value.shift();
    nextTick(() => {
      if (clanChatRef.value) clanChatRef.value.scrollTop = clanChatRef.value.scrollHeight;
    });
  });

  networkManager.onLobbyState = (state) => {
    if (lobbyEngine) lobbyEngine.applyLobbyState(state, networkManager.socket.id);
  };
  
  networkManager.onArcadeSlotsUpdate = (slots, details) => {
    if (lobbyEngine) lobbyEngine.setArcadeSlots(slots);
    if (details) spectatorSlots.value = details;
  };

  networkManager.onSpectatorJoined = (code) => {
    onlineState.roomCode = code;
    onlineState.isHost = false;
    isSpectator.value = true;
    hasOpponent.value = true; // Pretend we have opponent so UI draws
    gameState.value = 'CHAR_SELECT';
    if (lobbyEngine) lobbyEngine.stop();
  };
  
  networkManager.onSpectatorAdded = (socketId) => {
    // Host handles syncing room state to the newly joined spectator
    if (networkManager.isHost) {
      networkManager.sendLobbyAction({
        type: 'syncRoomState',
        gameState: gameState.value,
        p1Choice: p1Choice.value,
        p2Choice: p2Choice.value,
        remoteReady: remoteReady.value,
        localReady: localReady.value
      });
    }
  };

  networkManager.onSpectatorLeft = (socketId) => {
    // Optional: show a small toast notification
  };

  networkManager.onRoomCreated = (code) => {
    onlineState.roomCode = code;
    onlineState.isHost = true;
    onlineState.error = null;
    hasOpponent.value = false;
    gameState.value = 'CHAR_SELECT';
    if (lobbyEngine) lobbyEngine.stop();
  };
  networkManager.onRoomJoined = (code) => {
    onlineState.roomCode = code;
    onlineState.error = null;
    hasOpponent.value = true;
    gameState.value = 'CHAR_SELECT';
    if (lobbyEngine) lobbyEngine.stop();
    networkManager.sendLobbyAction({ type: 'setInfo', username: loggedInUsername.value });
  };
  networkManager.onGuestJoined = () => {
    hasOpponent.value = true;
    gameState.value = 'CHAR_SELECT';
    networkManager.sendLobbyAction({ type: 'setInfo', username: loggedInUsername.value });
  };
  networkManager.onRoomError = (msg) => {
    onlineState.error = msg;
    leaveLobby();
  };
  
  networkManager.onChatMessage = (msg) => {
    chatMessages.value.push(msg);
    if (chatMessages.value.length > 50) {
      chatMessages.value.shift();
    }
    setTimeout(() => {
      const chatBody = document.querySelector('.chat-messages');
      if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    }, 100);
    
    // Route chat bubble to player head
    if (gameState.value === 'LOBBY' && lobbyEngine) {
      if (lobbyEngine.localPlayer && lobbyEngine.localPlayer.username === msg.username) {
        lobbyEngine.localPlayer.setChatMessage(msg.text);
      } else {
        Object.values(lobbyEngine.remotePlayers).forEach(p => {
          if (p.username === msg.username && p.setChatMessage) p.setChatMessage(msg.text);
        });
      }
    } else if (gameState.value === 'PLAYING' && engine) {
      engine.entities.forEach(e => {
        if (e.type === 'player' && e.username === msg.username && e.setChatMessage) {
          e.setChatMessage(msg.text);
        }
      });
    }
  };
  
  networkManager.onGlobalBroadcast = (msg) => {
    globalBroadcastMessage.value = msg;
    import('../game/AudioManager').then(({ audioManager }) => audioManager.playQuestComplete());
    if (globalBroadcastTimer) clearTimeout(globalBroadcastTimer);
    globalBroadcastTimer = setTimeout(() => {
      globalBroadcastMessage.value = '';
    }, 15000); // Show for 15 seconds
  };

  networkManager.onLobbyAction = (data) => {
    if (data.type === 'syncRoomState') {
      gameState.value = data.gameState;
      p1Choice.value = data.p1Choice;
      p2Choice.value = data.p2Choice;
      localReady.value = data.localReady;
      remoteReady.value = data.remoteReady;
      if (data.gameState === 'FIGHT' && !engine) {
        startGame(true); // pass true for spectator join mid-game
      }
    } else if (data.type === 'setInfo') {
      opponentUsername.value = data.username || 'Opponent';
    } else if (data.type === 'selectChar') {
      p2Choice.value = data.char;
    } else if (data.type === 'ready') {
      remoteReady.value = data.isReady;
      checkBothReady();
    } else if (data.type === 'startGame') {
      startGame();
    } else if (data.type === 'rematchReady') {
      remoteReady.value = false;
      localReady.value = false;
      remoteRematchReady.value = data.isReady;
      checkBothRematchReady();
    } else if (data.type === 'startRematch') {
      resetGame();
    }
  };
  networkManager.onOpponentLeft = () => {
    if (gameState.value === 'FIGHT') {
      gameOver.value = true;
      resultText.value = 'OPPONENT DISCONNECTED';
      if (engine) engine.remotePlayer = null;
    } else {
      hasOpponent.value = false;
      p2Choice.value = '';
      remoteReady.value = false;
      localReady.value = false;
    }
  };

  // Listen for admin responses
  networkManager.socket.on('adminAuthenticated', (data) => {
    if (data.success) {
      showAdminLogin.value = false;
      showAdminDashboard.value = true;
      refreshOnlinePlayers();
      showSystemMessage('✅ 管理員身分已驗證 (Admin Authenticated)');
    } else {
      showSystemMessage('密碼錯誤 (Invalid Admin Password)');
    }
  });

  networkManager.socket.on('adminActionSuccess', (data) => {
    showSystemMessage(`✨ ${data.message}`);
  });

  networkManager.socket.on('progressSyncedFromServer', (newProgress) => {
    console.log('Received progressSyncedFromServer:', newProgress);
    goldCoins.value = newProgress.goldCoins || 0;
    tokens.value = newProgress.tokens || 0;
    unlockedSkins.value = newProgress.unlockedSkins || {
      Striker: ['default'],
      Mage: ['default'],
      Sniper: ['default'],
      Tank: ['default']
    };
    equippedSkins.value = newProgress.equippedSkins || {
      Striker: 'default',
      Mage: 'default',
      Sniper: 'default',
      Tank: 'default'
    };
    if (newProgress.quests) quests.value = newProgress.quests;
    if (newProgress.dailyQuests) dailyQuests.value = newProgress.dailyQuests;
    if (newProgress.lastDailyDate) lastDailyDate.value = newProgress.lastDailyDate;
    if (newProgress.hasUsedDailyRefresh !== undefined) hasUsedDailyRefresh.value = newProgress.hasUsedDailyRefresh;
    
    showSystemMessage('💰 系統通知：您的資產發生了變動！');
  });

  networkManager.socket.on('allUsersList', (users) => {
    allUsers.value = users;
  });

  networkManager.socket.on('onlinePlayersList', (players) => {
    // legacy, ignored
  });

  networkManager.socket.on('banResult', (data) => {
    if (data.success) {
      showSystemMessage(`🚫 玩家 [ ${data.target} ] 已被封鎖並踢除！`);
      refreshOnlinePlayers();
    }
  });

  networkManager.socket.on('banned', () => {
    alert('您已被管理員封鎖！(You have been banned by an administrator.)');
    window.location.reload(); // Force reload to kick them out
  });

  networkManager.socket.on('leaderboardData', (data) => {
    leaderboardData.value = data;
    if (typeof lobbyEngine !== 'undefined' && lobbyEngine) {
      lobbyEngine.setLeaderboardData(data);
    }
  });

  // Request leaderboard immediately after connection
  networkManager.socket.emit('getLeaderboard');
};

const selectChar = (playerNum, charName) => {
  if (isSpectator.value) return;
  if (playerNum === 1 && (onlineState.isHost || !isOnline.value)) {
    if (localReady.value) return; // Cannot change if ready
    p1Choice.value = charName;
    networkManager.sendLobbyAction({ type: 'selectChar', char: charName });
  } else {
    if (playerNum === 1) p1Choice.value = charName;
    if (playerNum === 2) p2Choice.value = charName;
  }
};

const toggleReady = () => {
  localReady.value = !localReady.value;
  networkManager.sendLobbyAction({ type: 'ready', isReady: localReady.value });
  checkBothReady();
};

const checkBothReady = () => {
  if (isOnline.value && networkManager.isHost) {
    if (localReady.value && remoteReady.value) {
      networkManager.sendLobbyAction({ type: 'startGame' });
      startGame();
    }
  }
};

const toggleRematchReady = () => {
  localRematchReady.value = !localRematchReady.value;
  networkManager.sendLobbyAction({ type: 'rematchReady', isReady: localRematchReady.value });
  checkBothRematchReady();
};

const checkBothRematchReady = () => {
  if (isOnline.value && networkManager.isHost) {
    if (localRematchReady.value && remoteRematchReady.value) {
      networkManager.sendLobbyAction({ type: 'startRematch' });
      resetGame();
    }
  }
};

const leaveLobby = () => {
  networkManager.leaveSlot();
  onlineState.roomCode = null;
  onlineState.error = null;
  gameState.value = 'LOBBY';
  isSpectator.value = false;
  // Reconnect to lobby
  setupNetworking();
  setTimeout(() => {
    if (!lobbyCanvas.value) {
      console.error("Lobby Canvas still not ready!");
    } else {
      initLobby();
    }
  }, 100);
};

const resumeLobby = () => {
  gameState.value = 'LOBBY';
  if (lobbyEngine) {
    lobbyEngine.start();
  } else {
    initLobby();
  }
};

const leaveShop = () => {
  resumeLobby();
};

const startGame = async () => {
  audioManager.resume();
  if (isVsCPU.value) {
    // Pick random unlocked char for CPU
    const unlocked = unlockedChars.value;
    p2Choice.value = unlocked[Math.floor(Math.random() * unlocked.length)];
  }

  gameState.value = 'FIGHT';
  await nextTick();
  
  // Double nextTick to ensure v-if has fully rendered the canvas
  if (!gameCanvas.value) {
    await nextTick();
  }
  
  // Triple check
  if (!gameCanvas.value) {
    await new Promise(r => setTimeout(r, 100));
    await nextTick();
  }
  
  engineDebug.running = gameCanvas.value ? 'canvas OK' : 'canvas NULL!';
  
  try {
    initGame();
    engineDebug.running = engine ? 'started' : 'engine null!';
  } catch (err) {
    engineDebug.running = 'ERROR: ' + err.message;
    console.error('Failed to initialize game:', err);
  }
};

const quickTraining = () => {
  isVsCPU.value = true;
  isOnline.value = false;
  gameState.value = 'CHAR_SELECT';
  if (lobbyEngine) lobbyEngine.stop();
};

const startOnlineTraining = () => {
  isVsCPU.value = true;
  // keep isOnline true, so gameState is emitted
  startGame();
  networkManager.sendLobbyAction({ type: 'startGame' }); // Tell spectators the game started
};

const quickTutorial = () => {
  gameState.value = 'TUTORIAL';
  if (lobbyEngine) lobbyEngine.stop();
};

const backToSelect = () => {
  if (engine) engine.stop();
  if (isOnline.value) {
    leaveLobby();
  } else {
    gameState.value = 'CHAR_SELECT';
  }
};

const initGame = () => {
  if (engine) engine.stop();

  gameTimer.value = 99;
  gameOver.value = false;
  resultText.value = '';
  roundStartText.value = '';

  localReady.value = false;
  remoteReady.value = false;
  localRematchReady.value = false;
  remoteRematchReady.value = false;

  if (window.playTimeInterval) clearInterval(window.playTimeInterval);

  quests.value.parries = 0;
  quests.value.ultimatesHit = 0;

  if (!gameCanvas.value) {
    engineDebug.running = 'FAIL: canvas is null';
    console.error('initGame: gameCanvas ref is null! Cannot initialize engine.');
    return;
  }

  engine = new GameEngine(gameCanvas.value);
  engine.isOnline = isOnline.value;
  engine.isHost = isOnline.value ? networkManager.isHost : true;

  // Player 1 (Red, always human if local/host, remote if guest)
  const p1Controls = keyBindings.value;
  p1 = new Player(100, 100, getEquippedSkinColor(p1Choice.value), p1Controls, 1, p1Choice.value, false, charLevels.value[p1Choice.value] || 1, playerEquipment.value, equippedSkins.value[p1Choice.value] || 'default', trophies.value);
  p1.engine = engine;
  p1.isOnline = isOnline.value;
  p1.isLocalPlayer = isSpectator.value ? false : (isOnline.value ? networkManager.isHost : true);

  // Player 2 (Blue)
  const p2Controls = isOnline.value 
    ? { left: 'a', right: 'd', up: 'w', down: 's', defend: 'shift', attack: ' ', skill: 'f', ultimate: 'e', burst: 'g' }
    : { left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown', defend: 'arrowdown', attack: 'enter', skill: '/', ultimate: 'p', burst: '[' };
    
  p2 = new Player(800, 100, getEquippedSkinColor(p2Choice.value), p2Controls, -1, p2Choice.value, isVsCPU.value, isOnline.value ? 1 : (charLevels.value[p2Choice.value] || 1), undefined, isOnline.value ? 'default' : (equippedSkins.value[p2Choice.value] || 'default'), isOnline.value ? 0 : 0); // P2 CPU doesn't use burst yet
  p2.engine = engine;
  p2.isOnline = isOnline.value;
  p2.isLocalPlayer = isSpectator.value ? false : (isOnline.value ? !networkManager.isHost : !isVsCPU.value);

  if (isOnline.value) {
    if (networkManager.isHost) {
      p1.username = loggedInUsername.value;
      p2.username = opponentUsername.value;
    } else if (isSpectator.value) {
      // Spectators see the original host/guest names (these should be synced via lobbyAction setInfo, but for now fallback)
      p1.username = 'Host';
      p2.username = opponentUsername.value || 'Guest';
    } else {
      p1.username = opponentUsername.value;
      p2.username = loggedInUsername.value;
    }
  } else {
    p1.username = loggedInUsername.value || 'Player 1';
    p2.username = isVsCPU.value ? 'CPU' : 'Player 2';
  }

  p1Health.value = p1.maxHealth || 100;
  p1MaxHealth.value = p1.maxHealth || 100;
  p2Health.value = p2.maxHealth || 100;
  p2MaxHealth.value = p2.maxHealth || 100;

  engine.addEntity(p1);
  engine.addEntity(p2);

  engine.onUpdate = () => {
    isCinematicActive.value = !!engine.cinematicActive;
    engineDebug.running = engine.isRunning ? '✅' : '❌';
    engineDebug.entities = engine.entities.length;
    engineDebug.roundStarting = engine.isRoundStarting ? '⏳' : '🟢';
    engineDebug.gameOver = engine.isGameOver ? '💀' : '🟢';
    
    p1CD.value = {
      skill: p1.skillReady,
      skillTimer: p1.cooldowns?.skill?.current?.toFixed(1) || 0,
      diveKick: p1.diveKickReady,
      diveKickTimer: p1.cooldowns?.diveKick?.current?.toFixed(1) || 0,
      counter: !p1.counterCooldown,
      counterTimer: p1.cooldowns?.counter?.current?.toFixed(1) || 0,
      pursuit: p1.cooldowns?.pursuit?.current <= 0,
      pursuitTimer: p1.cooldowns?.pursuit?.current?.toFixed(1) || 0,
      sweep: p1.cooldowns?.sweep?.current <= 0,
      sweepTimer: p1.cooldowns?.sweep?.current?.toFixed(1) || 0,
      defend: p1.cooldowns?.defense?.current <= 0,
      defendTimer: p1.cooldowns?.defense?.current?.toFixed(1) || 0,
      burst: p1.cooldowns?.burst?.current <= 0,
      burstTimer: p1.cooldowns?.burst?.current?.toFixed(1) || 0
    };
    p2CD.value = {
      skill: p2.skillReady,
      skillTimer: p2.cooldowns?.skill?.current?.toFixed(1) || 0,
      diveKick: p2.diveKickReady,
      diveKickTimer: p2.cooldowns?.diveKick?.current?.toFixed(1) || 0,
      counter: !p2.counterCooldown,
      counterTimer: p2.cooldowns?.counter?.current?.toFixed(1) || 0,
      pursuit: p2.cooldowns?.pursuit?.current <= 0,
      pursuitTimer: p2.cooldowns?.pursuit?.current?.toFixed(1) || 0,
      sweep: p2.cooldowns?.sweep?.current <= 0,
      sweepTimer: p2.cooldowns?.sweep?.current?.toFixed(1) || 0,
      defend: p2.cooldowns?.defense?.current <= 0,
      defendTimer: p2.cooldowns?.defense?.current?.toFixed(1) || 0,
      burst: p2.cooldowns?.burst?.current <= 0,
      burstTimer: p2.cooldowns?.burst?.current?.toFixed(1) || 0,
      hasBurst: p2.trophies >= 2000
    };
    p1BlockCount.value = p1.blockCount;
    p1UltimateReady.value = p1.ultimateReady;
    p2BlockCount.value = p2.blockCount;
    p2UltimateReady.value = p2.ultimateReady;
  };

  engine.onHealthChange = () => {
    p1Health.value = p1.health;
    p1MaxHealth.value = p1.maxHealth || 100;
    p2Health.value = p2.health;
    p2MaxHealth.value = p2.maxHealth || 100;
  };

  engine.onTimerChange = (time) => {
    gameTimer.value = time;
  };

  const incrementDailyQuest = (type, amount = 1) => {
    let updated = false;
    dailyQuests.value.forEach(q => {
      if (q.type === type && !q.done) {
        q.progress += amount;
        if (q.progress >= q.target) {
          q.progress = q.target;
          q.done = true;
          const reward = 50 + Math.floor(Math.random() * 51);
          goldCoins.value += reward;
          showSystemMessage(`🎉 每日任務完成: ${q.desc} (獲得 ${reward} 裝備金幣)`);
        }
        updated = true;
      }
    });
    if (updated) saveProgress();
  };

  const processWin = (result) => {
    const isLocalP1 = !isOnline.value || networkManager.isHost;
    const didLocalWin = isLocalP1 ? result === 'PLAYER 1 WINS' : result === 'PLAYER 2 WINS';
    
    if (didLocalWin) {
      const localPlayerObj = isLocalP1 ? p1 : p2;
      tokens.value += 10; // Reward for winning: 10 Gacha coins
      const oldTrophies = trophies.value;
      const hpRatio = Math.max(0, localPlayerObj.health / localPlayerObj.maxHealth);
      const earnedTrophies = 20 + Math.floor(hpRatio * 5);
      trophies.value += earnedTrophies;
      
      if (oldTrophies < 1000 && trophies.value >= 1000) {
        showMilestoneCelebration.value = true;
        milestoneType.value = 1000;
        if (isOnline.value) networkManager.emitMilestone(1000, loggedInUsername.value);
      } else if (oldTrophies < 2000 && trophies.value >= 2000) {
        showMilestoneCelebration.value = true;
        milestoneType.value = 2000;
        if (isOnline.value) networkManager.emitMilestone(2000, loggedInUsername.value);
      }
      
      systemMessage.value = `🏆 獲得了 ${earnedTrophies} 競技獎杯！`;
      if (systemMessageTimer) clearTimeout(systemMessageTimer);
      systemMessageTimer = setTimeout(() => { systemMessage.value = ''; }, 3000);
      incrementDailyQuest('totalWins', 1);
      
      if (localPlayerObj.health >= 100) {
         incrementDailyQuest('perfectWins', 1);
      }

      if (isVsCPU.value) {
        cpuMatches.value++;
        quests.value.cpuDefeated++;
        incrementDailyQuest('cpuDefeated', 1);
        if (quests.value.cpuDefeated >= 10 && !unlockedChars.value.includes('Sniper')) {
          unlockedChars.value.push('Sniper');
          charLevels.value['Sniper'] = 1;
          goldCoins.value += 500;
          showSystemMessage('🎯 任務完成！解鎖角色 [ SNIPER ] 並獲得 500 裝備金幣！');
        }
        if (cpuMatches.value >= 2) {
          cpuMatches.value = 0;
          tokens.value++;
          showSystemMessage('打贏人機！獲得一枚抽獎代幣！(Token +1)');
        } else {
          showSystemMessage(`打贏人機！進度: ${cpuMatches.value}/2`);
        }
      } else if (isOnline.value) {
        tokens.value++;
        showSystemMessage('對戰獲勝！獲得一枚抽獎代幣！(Token +1)');
      }
      
      // Give a minute of play time on win if the game was fast
      charPlayTime.value[p1Choice.value] = (charPlayTime.value[p1Choice.value] || 0) + 1;
      
      saveProgress();
    }
  };

  engine.onParry = (player) => {
    const isLocal = !isOnline.value ? player === p1 : (networkManager.isHost ? player === p1 : player === p2);
    if (isLocal) {
      incrementDailyQuest('parries', 1);
      if (!unlockedChars.value.includes('Brawler')) {
        quests.value.parries++;
        if (quests.value.parries >= 3) {
          unlockedChars.value.push('Brawler');
          charLevels.value['Brawler'] = 1;
          goldCoins.value += 500;
          showSystemMessage('💪 任務完成！解鎖角色 [ BRAWLER ] 並獲得 500 裝備金幣！');
          saveProgress();
        }
      }
    }
  };

  engine.onUltimateHit = (player) => {
    const isLocal = !isOnline.value ? player === p1 : (networkManager.isHost ? player === p1 : player === p2);
    if (isLocal) {
      incrementDailyQuest('ultimatesHit', 1);
      if (!unlockedChars.value.includes('Mage')) {
        quests.value.ultimatesHit++;
        if (quests.value.ultimatesHit === 1) {
          showSystemMessage('🔮 魔法師解鎖進度: 1 / 2 (終極技能命中)');
        }
        if (quests.value.ultimatesHit >= 2) {
          unlockedChars.value.push('Mage');
          charLevels.value['Mage'] = 1;
          goldCoins.value += 500;
          showSystemMessage('🔮 任務完成！解鎖角色 [ MAGE ] 並獲得 500 裝備金幣！');
          saveProgress();
        }
      }
    }
  };

  engine.onSkillUsed = (player) => {
    const isLocal = !isOnline.value ? player === p1 : (networkManager.isHost ? player === p1 : player === p2);
    if (isLocal) {
      incrementDailyQuest('skillsUsed', 1);
    }
  };

  engine.onGameOver = (result) => {
    gameOver.value = true;
    resultText.value = result;
    
    processWin(result);

    if (isOnline.value && networkManager.isHost) {
      networkManager.sendGameOver(result);
    }
    localRematchReady.value = false;
    remoteRematchReady.value = false;
  };

  engine.onRoundStartPhase = (text) => {
    roundStartText.value = text;
    if (isOnline.value && networkManager.isHost) {
      networkManager.sendRoundPhase(text);
    }
  };

  // Set up network listeners for syncing
  if (isOnline.value) {
    if (networkManager.isHost) {
      // Host receives inputs from Guest to apply to P2
      networkManager.onPlayerInput = (data) => {
        p2.handleNetworkInput(data.key, data.isDown);
      };
    } else {
      // Guest receives full state from Host
      networkManager.onGameState = (state) => {
        engine.applyNetworkState(state);
      };
      networkManager.onRoundPhase = (text) => {
        roundStartText.value = text;
      };
      networkManager.onGameOver = (result) => {
        gameOver.value = true;
        resultText.value = result;
        processWin(result);
      };
    }
  }

  // Track play time (every 60 seconds, add 1 minute to charPlayTime)
  let secondsPlayed = 0;
  if (window.playTimeInterval) clearInterval(window.playTimeInterval);
  window.playTimeInterval = setInterval(() => {
    if (!engine.isGameOver && !engine.isRoundStarting) {
      secondsPlayed++;
      if (secondsPlayed >= 60) {
        secondsPlayed = 0;
        charPlayTime.value[p1Choice.value] = (charPlayTime.value[p1Choice.value] || 0) + 1;
        saveProgress();
      }
    }
  }, 1000);

  engine.start();
};

const resetGame = () => {
  initGame();
};

// --- Admin Functions ---
const adminLogin = () => {
  if (adminPasswordInput.value === '0601') { // Note: Server expects username 'john', we supply it
    networkManager.adminAuthenticate('john', adminPasswordInput.value);
  } else {
    showSystemMessage('密碼錯誤 (Invalid Admin Password)');
  }
};

const grantMoney = () => {
  goldCoins.value += 99999;
  saveProgress();
  showSystemMessage('💰 已獲得 99,999 裝備金幣！');
};

const grantTrophies = () => {
  trophies.value += 10;
  saveProgress();
  showSystemMessage('🏆 已獲得 10 競技獎杯！目前：' + trophies.value);
};

const resetTrophiesTo1990 = () => {
  trophies.value = 1990;
  saveProgress();
  showSystemMessage('⏪ 獎杯已重置為 1990！請贏得一場對戰來觸發榮耀宗師彩蛋！');
};

const resetAccount = () => {
  if (confirm('確定要將帳號「神仙狀態」解除嗎？(只會將金幣與裝備歸零，不會影響您辛苦解鎖的角色與等級)')) {
    goldCoins.value = 0;
    playerEquipment.value = { defense: 0, attack: 0, maxHp: 0 };
    saveProgress();
    showSystemMessage('🔄 神仙模式已解除，金幣與裝備歸零！');
  }
};

const refreshOnlinePlayers = () => {
  networkManager.socket.emit('getAllUsers');
};

const banTarget = (targetUsername) => {
  if (confirm(`確定要封鎖並踢除玩家 [ ${targetUsername} ] 嗎？`)) {
    networkManager.banPlayer(targetUsername);
  }
};

const grantCurrencyToTarget = (targetUsername, type, amount) => {
  networkManager.adminGrantCurrency(targetUsername, type, amount);
};

onUnmounted(() => {
  if (engine) {
    engine.stop();
  }
});
</script>

<style scoped>
/* ===== SETTINGS ===== */
.settings-gear {
  position: absolute; top: 10px; right: 10px; z-index: 1000;
  font-size: 28px; cursor: pointer; background: rgba(0,0,0,0.5);
  border-radius: 50%; width: 40px; height: 40px; display: flex;
  align-items: center; justify-content: center;
  transition: transform 0.3s; border: 1px solid rgba(255,255,255,0.15);
}
.settings-gear:hover { transform: rotate(90deg); background: rgba(0,0,0,0.8); }

.settings-overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6); z-index: 999; display: flex;
  align-items: center; justify-content: center; backdrop-filter: blur(4px);
}
.settings-panel {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 1px solid rgba(255,255,255,0.15); border-radius: 16px;
  padding: 24px; width: 420px; max-height: 500px; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.settings-header h2 { margin: 0; font-size: 20px; }
.settings-close { background: none; border: none; color: #fff; font-size: 24px; cursor: pointer; padding: 4px 8px; }
.settings-close:hover { color: #ff4757; }

.settings-section { margin-bottom: 20px; padding: 14px; background: rgba(255,255,255,0.05); border-radius: 10px; }
.settings-section h3 { margin: 0 0 12px 0; font-size: 15px; color: #a29bfe; }

.volume-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.volume-row span:first-child { width: 70px; font-size: 13px; }
.volume-row input[type="range"] { flex: 1; accent-color: #a29bfe; height: 6px; }
.vol-pct { width: 40px; text-align: right; font-size: 12px; color: #74b9ff; }

.mute-btn {
  width: 100%; padding: 8px; margin-top: 8px; border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.05); color: #fff; border-radius: 8px; cursor: pointer;
  font-size: 13px; transition: background 0.2s;
}
.mute-btn:hover { background: rgba(255,255,255,0.15); }

.keybind-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.keybind-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.keybind-action { font-size: 12px; white-space: nowrap; }
.keybind-btn {
  padding: 4px 10px; min-width: 55px; border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.08); color: #48dbfb; border-radius: 6px;
  cursor: pointer; font-size: 12px; font-weight: bold; text-align: center;
  transition: all 0.2s;
}
.keybind-btn:hover { background: rgba(72,219,251,0.15); }
.keybind-btn.active { border-color: #feca57; color: #feca57; animation: pulse-key 0.8s infinite; }
@keyframes pulse-key { 0%,100% { box-shadow: 0 0 5px #feca57; } 50% { box-shadow: 0 0 15px #feca57; } }

.reset-keys-btn {
  width: 100%; padding: 8px; margin-top: 10px; border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,75,87,0.1); color: #ff6b6b; border-radius: 8px;
  cursor: pointer; font-size: 13px;
}
.reset-keys-btn:hover { background: rgba(255,75,87,0.25); }

/* Character Preview */
.preview-btn {
  position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.2); border-radius: 50%;
  width: 24px; height: 24px; font-size: 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s; padding: 0;
}
.preview-btn:hover { background: rgba(72,219,251,0.3); }
.char-preview-tooltip {
  position: absolute; bottom: -80px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.9); border: 1px solid #a29bfe; border-radius: 8px;
  padding: 8px 12px; z-index: 100; width: 200px; text-align: left; font-size: 11px;
}
.preview-passive { color: #feca57; margin-bottom: 3px; }
.preview-skill { color: #74b9ff; margin-bottom: 3px; }
.preview-stats { color: #dfe6e9; }

/* Social Buttons */
.social-buttons {
  position: absolute; top: 10px; left: 10px; z-index: 100;
  display: flex; gap: 6px;
}
.social-btn {
  width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2);
  background: rgba(0,0,0,0.5); font-size: 18px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s;
}
.social-btn:hover { background: rgba(0,0,0,0.8); }

/* Friends Sidebar */
.friends-sidebar {
  position: absolute; top: 0; left: 0; width: 260px; height: 100%;
  background: linear-gradient(180deg, #1a1a2e, #16213e); z-index: 998;
  border-right: 1px solid rgba(255,255,255,0.1); padding: 12px;
  overflow-y: auto; box-shadow: 5px 0 20px rgba(0,0,0,0.3);
}
.friends-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.friends-header h3 { margin: 0; font-size: 16px; }
.friend-add-row { display: flex; gap: 6px; margin-bottom: 12px; }
.friend-search {
  flex: 1; padding: 6px 10px; border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.05); color: #fff; border-radius: 6px; font-size: 12px;
}
.friend-add-btn {
  padding: 6px 10px; border: 1px solid #4cd137; background: rgba(76,209,55,0.15);
  color: #4cd137; border-radius: 6px; cursor: pointer; font-size: 14px;
}
.friend-section { margin-bottom: 12px; }
.friend-section h4 { margin: 0 0 6px 0; font-size: 12px; color: #a29bfe; }
.friend-row {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  border-radius: 6px; font-size: 12px; margin-bottom: 3px;
}
.friend-row:hover { background: rgba(255,255,255,0.05); }
.friend-status { font-size: 8px; color: #636e72; }
.friend-status.online { color: #4cd137; }
.friend-action-btn {
  padding: 2px 6px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
  background: rgba(255,255,255,0.1); color: #fff; margin-left: auto;
}
.friend-action-btn.accept { background: rgba(76,209,55,0.2); color: #4cd137; }
.friend-action-btn.decline { background: rgba(255,75,87,0.2); color: #ff4757; }
.friend-action-btn.invite { background: rgba(72,219,251,0.2); color: #48dbfb; }
.friend-action-btn.remove { background: rgba(255,75,87,0.1); color: #ff6b6b; }

/* Clan Panel */
.clan-panel-overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.6); z-index: 999; display: flex;
  align-items: center; justify-content: center; backdrop-filter: blur(4px);
}
.clan-panel {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 1px solid rgba(255,255,255,0.15); border-radius: 16px;
  padding: 24px; width: 380px; max-height: 480px; overflow-y: auto;
}
.clan-info-box {
  background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px; margin-bottom: 12px;
}
.clan-info-box h3 { margin: 0 0 6px 0; color: #feca57; }
.clan-info-box p { margin: 2px 0; font-size: 12px; color: #dfe6e9; }
.clan-members { margin-bottom: 12px; }

/* Clan Chat */
.clan-chat-section {
  background: rgba(0,0,0,0.2); border-radius: 10px; padding: 10px; margin-bottom: 12px;
}
.clan-chat-messages {
  height: 150px; overflow-y: auto; margin-bottom: 8px;
  background: rgba(0,0,0,0.3); border-radius: 6px; padding: 6px;
}
.clan-chat-msg {
  font-size: 11px; margin-bottom: 4px; line-height: 1.4;
}
.clan-chat-time { color: #636e72; margin-right: 4px; }
.clan-chat-name { color: #a29bfe; font-weight: bold; margin-right: 4px; }
.clan-chat-text { color: #dfe6e9; }
.clan-chat-replay { color: #feca57; font-size: 11px; display: block; margin: 2px 0; }
.clan-dl-replay-btn {
  padding: 2px 8px; border: 1px solid #48dbfb; background: rgba(72,219,251,0.15);
  color: #48dbfb; border-radius: 4px; cursor: pointer; font-size: 10px; margin-top: 2px;
}
.clan-dl-replay-btn:hover { background: rgba(72,219,251,0.3); }
.clan-chat-input-row { display: flex; gap: 6px; }

/* Battle Invite */
.battle-invite-popup {
  position: absolute; top: 50px; right: 10px; z-index: 1000;
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 2px solid #feca57; border-radius: 12px; padding: 12px 18px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4); animation: slideIn 0.3s ease;
}
.battle-invite-popup p { margin: 0 0 8px 0; font-size: 14px; }
.battle-invite-popup div { display: flex; gap: 8px; justify-content: center; }
@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* ===== MOBILE / ROTATE OVERLAY ===== */
.rotate-overlay {
  display: none;
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: #0f0f13; z-index: 99999;
  flex-direction: column; align-items: center; justify-content: center;
  color: white; font-family: 'Inter', sans-serif;
}
.rotate-overlay p { margin: 5px 0; font-size: 18px; }
.rotate-icon { font-size: 64px; margin-bottom: 10px; }
.rotate-arrow {
  font-size: 48px; color: #a29bfe;
  animation: rotateHint 2s ease-in-out infinite;
}
@keyframes rotateHint {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(90deg); }
}

/* Show rotate overlay ONLY on small screens in portrait */
@media screen and (max-width: 768px) and (orientation: portrait) {
  .rotate-overlay { display: flex !important; }
  .screen-wrapper { display: none !important; }
}

/* Mobile landscape: scale game to fill screen */
@media screen and (max-width: 1024px) and (orientation: landscape) {
  .app-wrapper {
    overflow: hidden;
    width: 100vw; height: 100vh;
    display: flex; align-items: center; justify-content: center;
  }
  .screen-wrapper {
    transform-origin: center center;
    width: 100vw !important; height: 100vh !important;
    max-width: 100vw !important; max-height: 100vh !important;
  }
  canvas {
    width: 100vw !important; height: 100vh !important;
    touch-action: none;
  }
}
.app-wrapper {
  background: #0f0f13;
  min-height: 100vh;
  font-family: 'Inter', sans-serif;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* --- Mode Select Screen --- */
.mode-buttons {
  display: flex;
  gap: 2rem;
}

.mode-btn {
  background: #2c2c40;
  border: 4px solid #2f3542;
  border-radius: 12px;
  padding: 3rem;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  width: 300px;
}

.mode-btn:hover {
  background: #3a3a52;
  border-color: #fff;
  transform: translateY(-10px);
  box-shadow: 0 10px 30px rgba(255,255,255,0.2);
}

.mode-btn h2 {
  font-size: 2rem;
  margin: 0 0 1rem 0;
}

.mode-btn p {
  font-size: 1.2rem;
  margin: 0;
  opacity: 0.7;
}

.tutorial-btn {
  background: #1e272e;
  border-color: #fffa65;
}

.tutorial-btn:hover {
  background: #485460;
  border-color: #fffa65;
  box-shadow: 0 10px 30px rgba(255, 250, 101, 0.2);
}

.tutorial-btn h2 {
  color: #fffa65;
}

/* --- Tutorial Screen --- */
.tutorial-screen {
  max-width: 800px;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  background: #1e1e2f;
  padding: 3rem 2rem;
  border-radius: 12px;
  border: 4px solid #2f3542;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

.tutorial-screen::-webkit-scrollbar {
  width: 10px;
}
.tutorial-screen::-webkit-scrollbar-track {
  background: #1e1e2f; 
}
.tutorial-screen::-webkit-scrollbar-thumb {
  background: #fffa65; 
  border-radius: 5px;
}

.close-x-btn {
  position: absolute;
  top: 15px;
  right: 20px;
  background: transparent;
  border: none;
  color: #fffa65;
  font-size: 3rem; /* Make the close 'X' much bigger */
  cursor: pointer;
  transition: transform 0.2s;
  padding: 10px;
  line-height: 1;
}

.close-x-btn:hover {
  transform: scale(1.2);
  color: #ff4757;
}

.tutorial-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.tutorial-section h2 {
  margin-top: 0;
  border-bottom: 2px solid rgba(255,255,255,0.1);
  padding-bottom: 0.5rem;
  letter-spacing: 2px;
}

.ctrl-grid {
  display: flex;
  justify-content: space-around;
  gap: 2rem;
}

.ctrl-col h3 {
  color: #a4b0be;
  margin-bottom: 1rem;
}

kbd {
  display: inline-block;
  background: #2f3542;
  border: 2px solid #57606f;
  border-radius: 4px;
  padding: 0.2rem 0.5rem;
  font-family: monospace;
  font-weight: bold;
  color: #fff;
  min-width: 25px;
  text-align: center;
  box-shadow: 0 4px 0 #57606f;
  margin-right: 0.5rem;
}

.combat-tips {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.combat-tips li {
  background: rgba(0,0,0,0.2);
  padding: 1rem;
  border-radius: 8px;
  border-left: 4px solid #ff4757;
  display: flex;
  flex-direction: column;
}

.combat-tips li strong {
  color: #fffa65;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
}

/* --- Shop Screen --- */
.shop-screen {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 20, 30, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 2rem;
  z-index: 100;
  overflow-y: auto;
}

.shopkeeper-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 0.5rem;
  position: relative;
}

.shopkeeper-img {
  width: 150px;
  height: auto;
  filter: drop-shadow(0 0 10px rgba(251, 197, 49, 0.5));
}

.shop-dialogue {
  background: white;
  color: black;
  padding: 1rem 2rem;
  border-radius: 20px;
  font-weight: bold;
  font-size: 1.2rem;
  margin-bottom: 10px;
  position: relative;
  text-align: center;
  border: 4px solid #fbc531;
}

.shop-dialogue::after {
  content: '';
  position: absolute;
  bottom: -15px;
  left: 50%;
  margin-left: -10px;
  border-width: 15px 10px 0;
  border-style: solid;
  border-color: #fbc531 transparent transparent transparent;
}

.shop-title {
  color: #fbc531;
  font-size: 3rem;
  text-shadow: 0 0 10px rgba(251, 197, 49, 0.8);
  margin-bottom: 0.5rem;
}

.shop-coins {
  font-size: 1.5rem;
  color: #ecf0f1;
  margin-bottom: 2rem;
  background: rgba(0,0,0,0.5);
  padding: 0.5rem 2rem;
  border-radius: 20px;
  border: 2px solid #e1b12c;
}

.shop-coins span {
  color: #fbc531;
  font-weight: bold;
}

.shop-items-container {
  display: flex;
  gap: 2rem;
  width: 100%;
  max-width: 1000px;
  justify-content: center;
}

.shop-item {
  background: rgba(255,255,255,0.05);
  border: 2px solid #718093;
  border-radius: 12px;
  padding: 2rem;
  width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: all 0.2s;
}

.shop-item:hover {
  transform: translateY(-5px);
  border-color: #fbc531;
  box-shadow: 0 10px 20px rgba(0,0,0,0.5);
}

.item-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 3rem;
  margin-bottom: 1rem;
  box-shadow: inset 0 0 15px rgba(0,0,0,0.5);
}

.shop-item h3 {
  color: #ecf0f1;
  margin-bottom: 0.5rem;
  font-size: 1.2rem;
}

.shop-item p {
  color: #bdc3c7;
  font-size: 0.9rem;
  margin-bottom: 1rem;
  flex-grow: 1;
}

.item-level {
  color: #4cd137;
  font-weight: bold;
  margin-bottom: 1rem;
}

.shop-btn-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.buy-btn {
  background: linear-gradient(180deg, #fbc531, #e1b12c);
  color: #2f3640;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  width: 100%;
  transition: all 0.2s;
}

.buy-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 0 15px rgba(251, 197, 49, 0.5);
}

.buy-btn:disabled {
  background: #718093;
  color: #dcdde1;
  cursor: not-allowed;
  opacity: 0.7;
}

.shop-back {
  position: absolute;
  top: 20px;
  left: 20px;
  margin: 0;
  width: auto;
  padding: 0.5rem 1rem;
}

/* --- Select Screen --- */
.select-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 1000px;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 100vh;
  padding: 2rem 0;
}

.select-title {
  font-size: 3rem;
  letter-spacing: 5px;
  margin-bottom: 3rem;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

.selectors-container {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 3rem;
}

.player-select {
  flex: 1;
  background: #1e1e2f;
  padding: 2rem;
  border-radius: 12px;
  border: 4px solid #2f3542;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

.cpu-waiting {
  opacity: 0.8;
}

.char-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.char-card {
  background: #2c2c40;
  padding: 0.5rem;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  width: 140px;
  text-align: center;
}

.char-card:hover {
  background: #3a3a52;
}

.char-card.selected {
  border-color: #fff;
  background: #3a3a52;
  box-shadow: 0 0 15px rgba(255,255,255,0.3);
}

.char-card h3 {
  margin: 0 0 0.5rem 0;
}

.char-card p {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.7;
}

.ready-stamp {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-15deg);
  font-size: 4rem;
  font-weight: bold;
  border: 8px solid;
  padding: 1rem 2rem;
  border-radius: 15px;
  text-shadow: 2px 2px 0 #000;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  pointer-events: none;
  z-index: 10;
  background: rgba(0,0,0,0.3);
}

.bottom-actions {
  display: flex;
  gap: 1rem;
}

.back-btn, .start-btn {
  padding: 1rem 3rem;
  font-size: 1.5rem;
  font-weight: bold;
  font-family: 'Inter', sans-serif;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn {
  background: transparent;
  color: white;
  border: 2px solid white;
}

.back-btn:hover {
  background: rgba(255,255,255,0.1);
}

.start-btn {
  color: #0f0f13;
  background: #fff;
  border: none;
}

.start-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255,255,255,0.5);
}

.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Battle Screen --- */
.game-container {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
}

canvas {
  box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  border: 4px solid #2f3542;
  border-radius: 8px;
  background-color: #1e1e2f;
}

.ui-layer {
  position: absolute;
  top: 3rem;
  width: 1024px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
  padding: 0 2rem;
  box-sizing: border-box;
}

.health-wrapper {
  flex: 1;
  max-width: 400px;
}

.char-name {
  font-size: 1.5rem;
  font-weight: 900;
  text-shadow: 2px 2px 0 #000;
  margin-bottom: 5px;
}

.cooldown-hud {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.cooldown-hud span {
  font-size: 0.8rem;
  font-weight: bold;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid #555;
  transition: all 0.2s;
}

.cooldown-hud .cd-ready {
  color: #fff;
  border-color: #4cd137;
  text-shadow: 0 0 5px #4cd137;
}

/* MILESTONE CELEBRATION CSS */
.milestone-overlay {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.9);
  z-index: 10000;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  animation: fadeIn 1s forwards;
  cursor: pointer;
}

.milestone-content {
  text-align: center;
  z-index: 10001;
  animation: popIn 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

.milestone-title {
  font-size: 5rem;
  font-weight: 900;
  margin-bottom: 20px;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
}

.gold-text {
  color: #fbc531;
  text-shadow: 0 0 20px #fbc531, 0 0 40px #fbc531;
}

.grandmaster-text {
  color: #e056fd;
  text-shadow: 0 0 20px #e056fd, 0 0 40px #e056fd, 0 0 80px #e056fd;
}

.milestone-sub {
  font-size: 2.5rem;
  color: white;
  margin-bottom: 40px;
  animation: pulse 2s infinite;
}

.click-to-continue {
  font-size: 1.5rem;
  color: #aaa;
  animation: blink 1.5s infinite;
}

@keyframes popIn {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* GLOBAL BROADCAST */
.global-broadcast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(90deg, rgba(255,0,0,0) 0%, rgba(224,86,253,0.8) 50%, rgba(255,0,0,0) 100%);
  width: 100%;
  padding: 15px 0;
  z-index: 9999;
  text-align: center;
  pointer-events: none;
}

.marquee-text {
  font-size: 1.8rem;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 10px #fffa65;
  white-space: nowrap;
  animation: slideText 10s linear infinite;
}

@keyframes slideText {
  0% { transform: translateX(100vw); }
  100% { transform: translateX(-100vw); }
}

.cooldown-hud .cd-cooling {
  color: #666;
  border-color: #333;
}

.cooldown-hud span small {
  font-size: 0.7rem;
  font-weight: normal;
  margin-left: 4px;
}

/* --- Auth Screen --- */
.auth-screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #1e272e;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.auth-box {
  background: #485460;
  padding: 3rem;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  text-align: center;
  width: 400px;
  border: 2px solid #00d2d3;
}

/* --- Locked Overlay --- */
.char-card.locked {
  filter: grayscale(100%);
  opacity: 0.5;
  cursor: not-allowed;
  border-color: #7f8fa6;
}

.char-card.locked:hover {
  transform: none;
  box-shadow: none;
  background: rgba(0,0,0,0.5);
}

.locked-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(232, 65, 24, 0.9);
  color: white;
  padding: 5px 10px;
  font-weight: bold;
  border-radius: 4px;
  font-size: 0.9rem;
  white-space: nowrap;
}

/* --- Lobby UI --- */
.lobby-controls {
  position: absolute; 
  top: 120px; 
  left: 20px; 
  color: white; 
  background: rgba(0,0,0,0.5); 
  padding: 15px; 
  border-radius: 8px;
  pointer-events: none;
}
.lobby-controls p {
  margin-bottom: 5px;
  font-size: 0.9rem;
}
.lobby-controls strong {
  color: #fffa65;
}

/* --- Gacha UI --- */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: #2c2c40;
  padding: 2rem;
  border-radius: 12px;
  border: 4px solid #fff;
  min-width: 400px;
}

.gacha-modal, .quest-modal {
  text-align: center;
  border-color: #fd79a8;
  box-shadow: 0 0 20px rgba(253, 121, 168, 0.4);
  max-height: 80vh;
  overflow-y: auto;
}
.quest-modal {
  border-color: #ff7675;
  box-shadow: 0 0 20px rgba(255, 118, 117, 0.4);
}
.quest-item {
  background: rgba(0,0,0,0.4);
  padding: 1rem;
  border-left: 5px solid #7f8fa6;
  margin: 1rem 0;
}

.refresh-btn {
  background: transparent;
  border: 1px solid #7f8fa6;
  color: #7f8fa6;
  border-radius: 4px;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  font-size: 0.8rem;
  transition: all 0.2s;
}
.refresh-btn:hover {
  background: #7f8fa6;
  color: #fff;
}

.quest-item.completed {
  border-left-color: #4cd137;
  opacity: 0.8;
}
.quest-item p {
  margin: 0.5rem 0 0 0;
  font-size: 0.9rem;
  color: #dcdde1;
}
.quest-item .progress {
  color: #fbc531;
  font-weight: bold;
}
.gacha-result {
  margin: 1.5rem 0;
  padding: 1rem;
  background: rgba(0,0,0,0.3);
  border-radius: 8px;
  animation: pulse 1s infinite alternate;
}
@keyframes pulse {
  from { transform: scale(1); }
  to { transform: scale(1.05); }
}

/* --- Utilities --- */
.ultimate-hud {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-top: 5px;
}

.blocks {
  display: flex;
  gap: 5px;
}

.block-pip {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2px solid #555;
  background: rgba(0, 0, 0, 0.5);
  transition: all 0.3s;
}

.block-pip.filled {
  background: #fffa65;
  border-color: #fffa65;
  box-shadow: 0 0 8px #fffa65;
}

.ultimate-prompt {
  font-size: 0.9rem;
  font-weight: 900;
  color: #ff4757;
  text-shadow: 0 0 10px rgba(255, 71, 87, 0.8);
  animation: pulse 1s infinite alternate;
}

@keyframes pulse {
  from { transform: scale(1); opacity: 0.8; }
  to { transform: scale(1.1); opacity: 1; }
}

.health-bar-bg {
  width: 100%;
  height: 30px;
  background-color: #2f3542;
  border: 3px solid #fff;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
}

.p1-health .health-bar-fill {
  background: linear-gradient(90deg, #ff4757, #ff6b81);
  transform-origin: left;
}

.p2-health .health-bar-fill {
  background: linear-gradient(90deg, #1e90ff, #70a1ff);
  transform-origin: right;
  margin-left: auto;
}

.health-bar-fill {
  height: 100%;
  width: 100%;
  transition: width 0.2s ease-out;
}

.timer {
  background-color: #2f3542;
  color: white;
  font-size: 2.5rem;
  font-weight: bold;
  padding: 0.5rem 1rem;
  border: 3px solid #fff;
  border-radius: 8px;
  margin: 0 1rem;
  min-width: 60px;
  text-align: center;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
}

.controls-overlay {
  position: absolute;
  bottom: 3rem;
  width: 1024px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
  padding: 0 2rem;
  box-sizing: border-box;
}

.player-info {
  background: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 1rem;
  border-radius: 8px;
  border: 2px solid;
  backdrop-filter: blur(4px);
}

.p1-info { border-color: #ff4757; }
.p2-info { border-color: #1e90ff; text-align: right; }

h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.2rem;
  text-transform: uppercase;
  letter-spacing: 2px;
}

p {
  margin: 0.2rem 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.game-over-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

.result-text {
  font-size: 5rem;
  color: white;
  text-transform: uppercase;
  letter-spacing: 5px;
  text-shadow: 4px 4px 0 #ff4757, -4px -4px 0 #1e90ff;
  margin-bottom: 2rem;
  animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.post-game-buttons {
  display: flex;
  gap: 1rem;
}

.reset-button {
  padding: 1rem 2rem;
  font-size: 1.2rem;
  font-weight: bold;
  font-family: 'Inter', sans-serif;
  color: white;
  background: #2f3542;
  border: 3px solid white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-button:hover {
  background: white;
  color: #2f3542;
  transform: scale(1.05);
}

.round-start-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 5;
}

.start-text {
  font-size: 8rem;
  color: white;
  text-transform: uppercase;
  letter-spacing: 10px;
  text-shadow: 0 0 20px #fffa65, 0 0 40px #ff9f43;
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes popIn {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
/* GACHA MACHINE CSS */
.gacha-machine-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.gacha-machine {
  position: relative;
  width: 300px;
  height: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.1s;
}

.gacha-machine.is-rolling {
  animation: shakeGacha 0.2s infinite;
}

@keyframes shakeGacha {
  0% { transform: translate(1px, 1px) rotate(0deg); }
  20% { transform: translate(-1px, -2px) rotate(-1deg); }
  40% { transform: translate(-3px, 0px) rotate(1deg); }
  60% { transform: translate(3px, 2px) rotate(0deg); }
  80% { transform: translate(1px, -1px) rotate(1deg); }
  100% { transform: translate(-1px, 2px) rotate(-1deg); }
}

.gacha-glass {
  width: 250px;
  height: 250px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  border: 5px solid rgba(255,255,255,0.5);
  box-shadow: inset -10px -10px 20px rgba(0,0,0,0.2), 0 10px 20px rgba(0,0,0,0.3);
  position: relative;
  overflow: hidden;
  z-index: 2;
  backdrop-filter: blur(2px);
}

.capsule {
  position: absolute;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--c1) 50%, var(--c2) 50%);
  border: 2px solid rgba(0,0,0,0.2);
  box-shadow: inset 5px 5px 10px rgba(255,255,255,0.4), 2px 2px 5px rgba(0,0,0,0.3);
  transform-origin: center;
}

.gacha-machine.is-rolling .capsule {
  animation: bounceCapsule 0.5s infinite alternate;
}

@keyframes bounceCapsule {
  to { transform: translateY(-30px) translateX(10px) rotate(20deg); }
}

.gacha-body {
  width: 280px;
  height: 250px;
  background: linear-gradient(180deg, #ff4757, #ff6b81);
  border-radius: 20px 20px 0 0;
  margin-top: -30px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 15px 30px rgba(0,0,0,0.5), inset 0 5px 15px rgba(255,255,255,0.3);
  border: 4px solid #c0392b;
  position: relative;
}

.gacha-logo {
  font-size: 1.8rem;
  font-weight: 900;
  color: #fff;
  text-shadow: 2px 2px 0 #000;
  margin-top: 40px;
  letter-spacing: 2px;
  text-align: center;
  line-height: 1.2;
}

.gacha-button {
  margin-top: 10px;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: linear-gradient(145deg, #f1c40f, #f39c12);
  border: 5px solid #fff;
  color: #d35400;
  font-weight: 900;
  font-size: 1.2rem;
  cursor: pointer;
  box-shadow: 0 10px 0 #d35400, 0 15px 20px rgba(0,0,0,0.4);
  transition: transform 0.1s, box-shadow 0.1s;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  line-height: 1.2;
  z-index: 5;
}

.gacha-button:active:not(:disabled) {
  transform: translateY(10px);
  box-shadow: 0 0 0 #d35400, 0 5px 10px rgba(0,0,0,0.4);
}

.gacha-button:disabled {
  filter: grayscale(1);
  cursor: not-allowed;
  opacity: 0.7;
}

.gacha-dispenser {
  width: 100px;
  height: 60px;
  background: #2d3436;
  border-radius: 30px 30px 0 0;
  position: absolute;
  bottom: 0;
  box-shadow: inset 0 10px 15px rgba(0,0,0,0.8);
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.gacha-dispensed-item {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fffa65 50%, #f39c12 50%);
  margin-bottom: -10px;
  animation: popOut 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes popOut {
  0% { transform: translateY(-50px) scale(0); }
  100% { transform: translateY(0) scale(1); }
}

.gacha-result-popup {
  position: absolute;
  bottom: 10%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.9);
  padding: 2rem;
  border-radius: 15px;
  border: 4px solid #f1c40f;
  text-align: center;
  z-index: 10;
  min-width: 300px;
  box-shadow: 0 0 30px rgba(241, 196, 15, 0.5);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  0% { transform: translate(-50%, 50px); opacity: 0; }
  100% { transform: translate(-50%, 0); opacity: 1; }
}

.close-gacha-btn {
  position: absolute;
  top: -50px;
  right: -150px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #ff4757;
  color: #fff;
  border: 3px solid #fff;
  font-size: 2rem;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
}

.close-gacha-btn:hover {
  background: #ff6b81;
}

.room-input {
  padding: 15px;
  font-size: 1.5rem;
  border-radius: 8px;
  border: 2px solid #ccc;
  outline: none;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  box-sizing: border-box;
}

.room-input:focus {
  border-color: #fffa65;
  box-shadow: 0 0 10px rgba(255,250,101,0.5);
}

.join-btn {
  padding: 15px 30px;
  font-size: 1.5rem;
  font-weight: 900;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s, background 0.2s;
  color: white;
}

.join-btn:hover {
  transform: scale(1.05);
}

.gacha-info {
  position: absolute;
  top: 10px;
  left: 20px;
  text-align: left;
  color: #fff;
  font-weight: bold;
}
/* --- Admin --- */
.admin-actions {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.admin-btn {
  flex: 1;
  padding: 0.8rem;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.1s;
}
.admin-btn:active { transform: scale(0.95); }

.money-btn { background: #fbc531; color: black; }
.refresh-btn { background: #00a8ff; color: white; }

.player-list-container {
  max-height: 300px;
  overflow-y: auto;
  background: rgba(0,0,0,0.3);
  border-radius: 8px;
  padding: 0.5rem;
  margin-top: 0.5rem;
}

.player-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.player-row:last-child { border-bottom: none; }

.player-info {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.player-name { font-weight: bold; color: #fbc531; font-size: 1.1rem; }
.player-char { color: #dcdde1; }

.ban-btn {
  background: #e84118;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.4rem 0.8rem;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}
.ban-btn:hover { background: #c23616; }


.skin-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #2f3542;
  border-radius: 8px;
  padding: 10px;
  margin-top: 20px;
  width: 100%;
  max-width: 300px;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
  margin-left: auto;
  margin-right: auto;
}

.skin-arrow {
  background: #57606f;
  border: none;
  color: white;
  font-size: 1.5rem;
  padding: 5px 15px;
  border-radius: 4px;
  cursor: pointer;
  transition: 0.2s;
}

.skin-arrow:hover {
  background: #747d8c;
}

.skin-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex-grow: 1;
}

.skin-name {
  font-weight: bold;
  font-size: 1.1rem;
  text-shadow: 1px 1px 2px #000;
}

.buy-skin-btn {
  background: #fbc531;
  color: #2f3640;
  border: none;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s;
}

.buy-skin-btn:hover {
  background: #e1b12c;
  transform: scale(1.05);
}

.equip-skin-btn {
  background: #4cd137;
  color: white;
  border: none;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s;
}

.equip-skin-btn:hover {
  background: #44bd32;
  transform: scale(1.05);
}

.equipped-text {
  font-weight: bold;
  font-size: 0.9rem;
}

/* Mobile Controls */
.mobile-controls-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Let clicks pass through empty areas */
  z-index: 1000;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.joystick-zone {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 50%;
  height: 100%;
  pointer-events: auto;
  touch-action: none;
}

.joystick-base {
  position: fixed;
  width: 120px;
  height: 120px;
  background: rgba(255, 255, 255, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.joystick-nub {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50px;
  height: 50px;
  margin-top: -25px;
  margin-left: -25px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
}

.action-buttons {
  position: absolute;
  right: 20px;
  bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  width: 180px;
  justify-content: flex-end;
  gap: 15px;
  pointer-events: auto;
}

.action-btn {
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  color: white;
  font-size: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none;
  -webkit-user-select: none;
}

.action-btn:active {
  background: rgba(255, 255, 255, 0.5);
}

.action-btn.attack { transform: translate(-30px, -40px); width: 80px; height: 80px; font-size: 32px; background: rgba(255, 71, 87, 0.4); border-color: #ff4757; }
.action-btn.skill { background: rgba(251, 197, 49, 0.4); border-color: #fbc531; }
.action-btn.defend { background: rgba(46, 213, 115, 0.4); border-color: #2ed573; }
.action-btn.interact { background: rgba(52, 152, 219, 0.4); border-color: #3498db; }
.action-btn.intercept { background: rgba(155, 89, 182, 0.4); border-color: #9b59b6; font-size: 20px; }
.action-btn.ultimate { background: rgba(230, 126, 34, 0.4); border-color: #e67e22; font-size: 20px; }
.action-btn.burst { background: rgba(236, 240, 241, 0.4); border-color: #ecf0f1; color: #e74c3c; font-size: 20px; }
</style>
