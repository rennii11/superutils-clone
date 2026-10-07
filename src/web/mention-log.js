(function (global) {
  function value(input, fallback) {
    return typeof input === 'string' && input.trim() ? input.trim() : fallback
  }

  function formatMentionLogTime(at) {
    const date = new Date(at)
    return Number.isFinite(date.getTime()) ? date.toLocaleString('vi-VN', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric' }) : ''
  }

  function formatMentionLog(item, timeText) {
    const channel = value(item?.channelName, '')
    const message = value(item?.messageContent, '[Tin nhắn không có nội dung văn bản]')
    const mentionedUserId = value(item?.mentionedUserId, '')
    const mentionedUsername = value(item?.mentionedUsername, '')
    const displayMessage = /^\d{17,20}$/.test(mentionedUserId) && mentionedUsername ? message.replace(new RegExp('<@!?' + mentionedUserId + '>', 'g'), '@' + mentionedUsername) : message
    return [
      'Người nhắc: ' + value(item?.authorTag, '?'),
      'Server: ' + value(item?.guildName, 'Không xác định'),
      'Channel: ' + (channel ? '#' + channel : 'Không xác định'),
      'Nội dung: ' + displayMessage,
      'Thời gian: ' + value(timeText, 'Không xác định')
    ].join('\n')
  }

  global.formatMentionLog = formatMentionLog
  global.formatMentionLogTime = formatMentionLogTime
})(window)
