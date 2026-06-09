function filterShareFriends(friends, search) {
  var q = (search || '').trim().toLowerCase()
  var list = friends || []
  var filtered = list.filter(function (f) {
    if (!q) return true
    var name = (f.name || '').toLowerCase()
    var job = (f.job || '').toLowerCase()
    return name.indexOf(q) !== -1 || job.indexOf(q) !== -1
  })
  return filtered.slice(0, 10)
}

function markShareFriendsSelected(friends, selectedIds) {
  var ids = selectedIds || []
  return (friends || []).map(function (f) {
    return Object.assign({}, f, { selected: ids.indexOf(f.id) !== -1 })
  })
}

function mapFriendFromApi(f, avatarColors, resolveAvatarUrl) {
  var colors = avatarColors(f.id)
  return {
    id: f.id,
    name: f.name || '',
    job: f.job_title || '',
    co: f.company || '',
    nameAbbr: (f.name || '').slice(0, 2),
    bg: colors.bg,
    c: colors.c,
    avatarUrl: resolveAvatarUrl(f.avatar_url)
  }
}

module.exports = {
  filterShareFriends: filterShareFriends,
  markShareFriendsSelected: markShareFriendsSelected,
  mapFriendFromApi: mapFriendFromApi
}
