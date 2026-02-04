const API = 'https://api.escuelajs.co/api/v1/products'

let products = []
let filtered = []
let page = 1
let pageSize = parseInt(document.getElementById('pageSize').value)
let sortField = null
let sortDir = 1

const tableBody = document.querySelector('#productsTable tbody')
const searchInput = document.getElementById('searchInput')
const pagination = document.getElementById('pagination')
const showingRange = document.getElementById('showingRange')

async function fetchProducts(){
  const res = await fetch(API)
  products = await res.json()
  filtered = products.slice()
  render()
}

function applyFilters(){
  const q = searchInput.value.trim().toLowerCase()
  filtered = products.filter(p => p.title.toLowerCase().includes(q))
  if(sortField){
    filtered.sort((a,b)=>{
      if(a[sortField] < b[sortField]) return -1*sortDir
      if(a[sortField] > b[sortField]) return 1*sortDir
      return 0
    })
  }
}

function render(){
  applyFilters()
  pageSize = parseInt(document.getElementById('pageSize').value)
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if(page > totalPages) page = totalPages

  const start = (page-1)*pageSize
  const end = Math.min(total, start + pageSize)
  const view = filtered.slice(start, end)

  tableBody.innerHTML = ''
  for(const p of view){
    const tr = document.createElement('tr')
    tr.setAttribute('data-desc', p.description || '')
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${escapeHtml(p.title)}</td>
      <td>${p.price}</td>
      <td>${p.category ? escapeHtml(p.category.name || p.category) : ''}</td>
      <td>${(p.images||[]).slice(0,2).map(u=>`<img src="${u}"/>`).join(' ')}</td>
    `
    tr.addEventListener('mouseenter', showTooltip)
    tr.addEventListener('mouseleave', hideTooltip)
    tr.addEventListener('click', ()=>openViewModal(p))
    tableBody.appendChild(tr)
  }

  // pagination
  pagination.innerHTML = ''
  for(let i=1;i<=totalPages;i++){
    const btn = document.createElement('button')
    btn.className = 'btn btn-sm ' + (i===page ? 'btn-primary' : 'btn-outline-primary')
    btn.textContent = i
    btn.addEventListener('click', ()=>{ page = i; render() })
    pagination.appendChild(btn)
  }

  showingRange.textContent = `${start+1}-${end} of ${total}`
}

function showTooltip(e){
  const txt = e.currentTarget.getAttribute('data-desc')
  if(!txt) return
  const tip = document.createElement('div')
  tip.className = 'tooltip-desc'
  tip.textContent = txt
  document.body.appendChild(tip)
  const r = e.currentTarget.getBoundingClientRect()
  tip.style.left = (r.right + 8) + 'px'
  tip.style.top = (r.top) + 'px'
  e.currentTarget._tip = tip
}

function hideTooltip(e){
  const tip = e.currentTarget._tip
  if(tip) tip.remove()
}

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// search
let searchTimeout = null
searchInput.addEventListener('input', ()=>{
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(()=>{ page=1; render() }, 150)
})

document.getElementById('pageSize').addEventListener('change', ()=>{ page=1; render() })

// sorting
document.querySelectorAll('.sort').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const f = btn.dataset.field
    if(sortField === f) sortDir = -sortDir
    else { sortField = f; sortDir = 1 }
    render()
  })
})

// CSV export
document.getElementById('exportCsv').addEventListener('click', ()=>{
  const rows = []
  const headers = ['id','title','price','category','images']
  rows.push(headers.join(','))
  const start = (page-1)*pageSize
  const view = filtered.slice(start, start+pageSize)
  for(const p of view){
    const imgs = (p.images||[]).join('|')
    const cat = p.category ? (p.category.name || p.category) : ''
    rows.push([p.id, csvEscape(p.title), p.price, csvEscape(cat), csvEscape(imgs)].join(','))
  }
  const blob = new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'products.csv'
  a.click()
  URL.revokeObjectURL(url)
})

function csvEscape(s){
  if(typeof s !== 'string') s = String(s)
  if(s.includes(',')||s.includes('\n')||s.includes('"')){
    return '"'+s.replace(/"/g,'""')+'"'
  }
  return s
}

// view / edit modal
const viewModalEl = document.getElementById('viewModal')
const viewModal = new bootstrap.Modal(viewModalEl)

function openViewModal(p){
  document.getElementById('editId').value = p.id
  document.getElementById('editTitle').value = p.title
  document.getElementById('editPrice').value = p.price
  document.getElementById('editDescription').value = p.description || ''
  document.getElementById('editCategory').value = p.category ? (p.category.id || p.category) : ''
  document.getElementById('editImages').value = (p.images||[]).join(',')
  viewModal.show()
}

document.getElementById('saveEdit').addEventListener('click', async ()=>{
  const id = document.getElementById('editId').value
  const payload = {
    title: document.getElementById('editTitle').value,
    price: parseFloat(document.getElementById('editPrice').value) || 0,
    description: document.getElementById('editDescription').value,
    categoryId: parseInt(document.getElementById('editCategory').value) || 1,
    images: document.getElementById('editImages').value.split(',').map(s=>s.trim()).filter(Boolean)
  }
  try{
    console.debug('PUT payload', payload)
    const res = await fetch(`${API}/${id}`, {
      method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    })
    let bodyText = ''
    try{ bodyText = await res.text() }catch(e){ bodyText = '' }
    if(!res.ok){
      let msg = `Update failed: ${res.status} ${res.statusText}`
      try{ const j = JSON.parse(bodyText); msg += '\n'+JSON.stringify(j) }catch(e){ if(bodyText) msg += '\n'+bodyText }
      throw new Error(msg)
    }
    const updated = bodyText ? JSON.parse(bodyText) : {}
    const idx = products.findIndex(x=>x.id==updated.id)
    if(idx>=0) products[idx] = updated
    render()
    viewModal.hide()
  }catch(err){ console.error(err); alert(err.message) }
})

// delete
document.getElementById('deleteBtn').addEventListener('click', async ()=>{
  const id = document.getElementById('editId').value
  if(!id) return alert('Missing id')
  if(!confirm('Delete this product?')) return
  try{
    console.debug('DELETE', id)
    const res = await fetch(`${API}/${id}`, { method: 'DELETE' })
    let bodyText = ''
    try{ bodyText = await res.text() }catch(e){ bodyText = '' }
    if(!res.ok){
      let msg = `Delete failed: ${res.status} ${res.statusText}`
      if(bodyText) msg += '\n'+bodyText
      throw new Error(msg)
    }
    // remove locally
    products = products.filter(p => p.id != Number(id))
    render()
    viewModal.hide()
  }catch(err){ console.error(err); alert(err.message) }
})

// create
document.getElementById('createSubmit').addEventListener('click', async ()=>{
  const payload = {
    title: document.getElementById('createTitle').value,
    price: parseFloat(document.getElementById('createPrice').value) || 0,
    description: document.getElementById('createDescription').value,
    categoryId: parseInt(document.getElementById('createCategory').value) || 1,
    images: document.getElementById('createImages').value.split(',').map(s=>s.trim()).filter(Boolean)
  }
  try{
    console.debug('POST payload', payload)
    const res = await fetch(API, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
    let bodyText = ''
    try{ bodyText = await res.text() }catch(e){ bodyText = '' }
    if(!res.ok){
      let msg = `Create failed: ${res.status} ${res.statusText}`
      try{ const j = JSON.parse(bodyText); msg += '\n'+JSON.stringify(j) }catch(e){ if(bodyText) msg += '\n'+bodyText }
      throw new Error(msg)
    }
    const created = bodyText ? JSON.parse(bodyText) : {}
    products.unshift(created)
    render()
    const cm = bootstrap.Modal.getInstance(document.getElementById('createModal'))
    cm.hide()
  }catch(err){ console.error(err); alert(err.message) }
})

function csvEscapeHeader(s){ return '"'+s.replace(/"/g,'""')+'"' }

function init(){
  fetchProducts()
}

init()
