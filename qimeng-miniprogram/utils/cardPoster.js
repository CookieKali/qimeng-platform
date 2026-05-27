var POSTER_W = 750

var COLORS = {
  bg: '#0a0b0f',
  surface: '#18191f',
  accent: '#60a5fa',
  white: '#f1f3f9',
  muted: '#9499b0',
  line: 'rgba(255, 255, 255, 0.08)'
}

function loadImage(canvas, src) {
  return new Promise(function (resolve) {
    if (!src) {
      resolve(null)
      return
    }
    var img = canvas.createImage()
    img.onload = function () { resolve(img) }
    img.onerror = function () { resolve(null) }
    img.src = src
  })
}

function wrapLines(ctx, text, maxWidth) {
  var raw = String(text || '').trim()
  if (!raw) return []
  var lines = []
  var line = ''
  var chars = raw.split('')
  for (var i = 0; i < chars.length; i++) {
    var test = line + chars[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = chars[i]
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawBlock(ctx, label, text, x, y, maxW) {
  if (!text) return y
  ctx.font = '26px sans-serif'
  var lines = wrapLines(ctx, text, maxW - 48)
  var blockH = 76 + lines.length * 36 + 20
  ctx.fillStyle = COLORS.surface
  roundRect(ctx, x, y, maxW, blockH, 12)
  ctx.fill()
  ctx.fillStyle = COLORS.accent
  ctx.font = 'bold 24px sans-serif'
  ctx.fillText(label, x + 24, y + 36)
  var py = y + 76
  ctx.fillStyle = COLORS.white
  ctx.font = '26px sans-serif'
  lines.forEach(function (ln) {
    ctx.fillText(ln, x + 24, py)
    py += 36
  })
  return y + blockH + 16
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function estimateHeight(card) {
  var h = 360
  if (card.industryText) h += 120
  if (card.personalValue) h += 140
  if (card.resourcesText) h += 120
  if (card.needsText) h += 120
  return Math.max(h, 520)
}

function drawPoster(ctx, card, avatarImg) {
  var pad = 48
  var maxW = POSTER_W - pad * 2
  var y = 56

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, POSTER_W, estimateHeight(card))

  ctx.fillStyle = COLORS.accent
  ctx.font = 'bold 28px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('我的名片', POSTER_W / 2, y)
  y += 64
  ctx.textAlign = 'left'

  var avR = 56
  var avX = POSTER_W / 2
  var avY = y + avR
  ctx.beginPath()
  ctx.arc(avX, avY, avR, 0, Math.PI * 2)
  ctx.fillStyle = card.avatarBg || '#0c1e38'
  ctx.fill()
  if (avatarImg) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(avX, avY, avR, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(avatarImg, avX - avR, avY - avR, avR * 2, avR * 2)
    ctx.restore()
  } else {
    ctx.fillStyle = card.avatarC || '#5cb8ff'
    ctx.font = 'bold 40px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(card.nameAbbr || '', avX, avY + 14)
    ctx.textAlign = 'left'
  }
  y = avY + avR + 40

  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.white
  ctx.font = 'bold 40px sans-serif'
  ctx.fillText(card.name || '', POSTER_W / 2, y)
  y += 36
  if (card.headline) {
    ctx.fillStyle = COLORS.muted
    ctx.font = '26px sans-serif'
    ctx.fillText(card.headline, POSTER_W / 2, y)
    y += 48
  } else {
    y += 24
  }
  ctx.textAlign = 'left'

  ctx.strokeStyle = COLORS.line
  ctx.beginPath()
  ctx.moveTo(pad, y)
  ctx.lineTo(POSTER_W - pad, y)
  ctx.stroke()
  y += 32

  y = drawBlock(ctx, '行业', card.industryText, pad, y, maxW)
  y = drawBlock(ctx, '个人价值', card.personalValue, pad, y, maxW)
  y = drawBlock(ctx, '可提供资源', card.resourcesText, pad, y, maxW)
  y = drawBlock(ctx, '当前需求', card.needsText, pad, y, maxW)

  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.muted
  ctx.font = '22px sans-serif'
  ctx.fillText('企盟 · 数字名片', POSTER_W / 2, y + 20)
  return y + 60
}

function exportCardPoster(page, card) {
  return new Promise(function (resolve, reject) {
    var height = estimateHeight(card)
    var query = wx.createSelectorQuery().in(page)
    query.select('#cardPosterCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error('canvas init failed'))
          return
        }
        var canvas = res[0].node
        var ctx = canvas.getContext('2d')
        var dpr = wx.getSystemInfoSync().pixelRatio || 2
        canvas.width = POSTER_W * dpr
        canvas.height = height * dpr
        ctx.scale(dpr, dpr)
        loadImage(canvas, card.avatarUrl).then(function (avatarImg) {
          drawPoster(ctx, card, avatarImg)
          wx.canvasToTempFilePath({
            canvas: canvas,
            width: POSTER_W * dpr,
            height: height * dpr,
            destWidth: POSTER_W * 2,
            destHeight: height * 2,
            fileType: 'png',
            quality: 1,
            success: function (r) { resolve(r.tempFilePath) },
            fail: reject
          })
        }).catch(reject)
      })
  })
}

module.exports = {
  exportCardPoster: exportCardPoster
}
