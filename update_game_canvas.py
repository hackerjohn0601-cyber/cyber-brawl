import re

with open('client/src/components/GameCanvas.vue', 'r') as f:
    code = f.read()

# Add trophies ref
code = code.replace("const goldCoins = ref(0);", "const goldCoins = ref(0);\nconst trophies = ref(0);")

# Update saveProgress
code = code.replace("goldCoins: goldCoins.value,", "goldCoins: goldCoins.value,\n    trophies: trophies.value,")

# Update loadProgress
code = code.replace("goldCoins.value = data.progress.goldCoins || 0;", "goldCoins.value = data.progress.goldCoins || 0;\n      trophies.value = data.progress.trophies || 0;")

# Update processWin
old_win = "tokens.value += 10; // Reward for winning: 10 Gacha coins"
new_win = """tokens.value += 10; // Reward for winning: 10 Gacha coins
      const hpRatio = Math.max(0, localPlayerObj.health / localPlayerObj.maxHealth);
      const earnedTrophies = 20 + Math.floor(hpRatio * 5);
      trophies.value += earnedTrophies;
      showSystemMessage(`🏆 獲得了 ${earnedTrophies} 競技獎杯！`);"""
code = code.replace(old_win, new_win)

# Ensure showSystemMessage exists and use it if it does, wait, I need to check if there is a showSystemMessage function.
# Wait, I used systemMessage.value = ... earlier. Let me just use systemMessage.value directly instead of showSystemMessage because I didn't see showSystemMessage defined, just the assignment and setTimeout.

new_win_fixed = """tokens.value += 10; // Reward for winning: 10 Gacha coins
      const hpRatio = Math.max(0, localPlayerObj.health / localPlayerObj.maxHealth);
      const earnedTrophies = 20 + Math.floor(hpRatio * 5);
      trophies.value += earnedTrophies;
      systemMessage.value = `🏆 獲得了 ${earnedTrophies} 競技獎杯！`;
      if (systemMessageTimer) clearTimeout(systemMessageTimer);
      systemMessageTimer = setTimeout(() => { systemMessage.value = ''; }, 3000);"""
code = code.replace(new_win, new_win_fixed)

# Add to Lobby HUD
old_hud = "<div>🎟️ 扭蛋代幣: <span style=\"color: #fbc531; font-weight: bold;\">{{ tokens }}</span></div>"
new_hud = "<div>🎟️ 扭蛋代幣: <span style=\"color: #fbc531; font-weight: bold;\">{{ tokens }}</span></div>\n        <div>🏆 競技獎杯: <span style=\"color: #00d2d3; font-weight: bold;\">{{ trophies }}</span></div>"
code = code.replace(old_hud, new_hud)

# Add to Skin Shop HUD
old_skin_hud = "抽獎代幣 (Tokens): <span style=\"color: #fbc531;\">{{ tokens }}</span>"
new_skin_hud = "抽獎代幣 (Tokens): <span style=\"color: #fbc531;\">{{ tokens }}</span> &nbsp;|&nbsp; 🏆 競技獎杯: <span style=\"color: #00d2d3;\">{{ trophies }}</span>"
code = code.replace(old_skin_hud, new_skin_hud)

# Update hasSkin
old_hasSkin = """const hasSkin = (charName, skinId) => {
  if (skinId === 'default') return true;
  return unlockedSkins.value.includes(`${charName}_${skinId}`);
};"""
new_hasSkin = """const hasSkin = (charName, skinId) => {
  if (skinId === 'default') return true;
  if (skinId === 'champion') return trophies.value >= 1000;
  return unlockedSkins.value.includes(`${charName}_${skinId}`);
};"""
code = code.replace(old_hasSkin, new_hasSkin)

with open('client/src/components/GameCanvas.vue', 'w') as f:
    f.write(code)

