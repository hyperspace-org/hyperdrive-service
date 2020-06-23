module.exports = class NetworkSet {
  constructor () {
    this.list = []
  }

  has (name) {
    return this.list.includes(name)
  }

  add (name) {
    if (this.list[this.list.length - 1] === name) return

    const idx = this.list.indexOf(name, 2)
    if (idx > -1) this.list.splice(idx, 1)
    this.list.push(name)

    if (this.list.length >= 18) this.list.shift()
  }
}
