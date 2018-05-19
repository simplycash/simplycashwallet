import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import 'rxjs/add/operator/catch'
import 'rxjs/add/operator/toPromise'
import { Storage } from '@ionic/storage'
import { AlertController, App, Events, LoadingController, ToastController } from 'ionic-angular'
// import { KeychainTouchId } from '@ionic-native/keychain-touch-id'
import { LocalNotifications } from '@ionic-native/local-notifications'
import 'rxjs/add/operator/timeout'
import QRCode from 'qrcode'
import * as bitcoincash from 'bitcoincashjs'
import io from 'socket.io-client'
import * as protobuf from 'protobufjs'
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'
import * as crypto from 'crypto-browserify'
import { Buffer } from 'buffer'


@Injectable()
export class Wallet {
  private STATE: any = Object.freeze({ CLOSED: 1, OFFLINE: 2, CONNECTING: 3, CONNECTED: 4, SYNCING: 5, SYNCED: 6 })
  private WALLET_KEY: string = '_wallet'
  private WS_URL: string = 'https://ws.simply.cash:3000'
  private ADDRESS_LIMIT: number = 100

  private UNITS: { [key: string]: { rate: number, dp: number } } = {
    'BCH': {rate: 1, dp: 8},
    'SATOSHIS': {rate: 1e8, dp: 0}
  }
  private units: string[] = ['BCH', 'SATOSHIS']

  private supportedAddressFormats: string[] = ['legacy', 'cashaddr', 'bitpay']

  private socket: any
  private socketRequestId: number = 0

  private state: number = this.STATE.CLOSED
  private syncTaskId: number = 0
  private pendingAddresses: string[] = []
  private notificationId: number = 0

  private stored: {
    keys: {
      mnemonic: string,
      xpub: string
    },
    addresses: {
      receive: string[],
      change: string[]
    },
    cache: {
      receiveAddress: string,
      changeAddress: string,
      utxos: {
        txid: string,
        vout: number,
        address: string,
        path: number[],
        scriptPubKey: string,
        satoshis: number
      }[],
      history: {
        txid: string,
        timestamp: number,
        delta: number,
        seen: boolean
      }[]
    },
    preference: {
      currency: string,
      addressFormat: string,
      // fingerprint: boolean
    }
  }

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    public events: Events,
    private http: HttpClient,
    // private keychainTouchId: KeychainTouchId,
    public loadingCtrl: LoadingController,
    private localNotifications: LocalNotifications,
    public storage: Storage,
    private toastCtrl: ToastController
  ) { }

  //fingerprint

  // async canUseFingerprint() {
  //   return await this.keychainTouchId.isAvailable()
  // }
  //
  // isUsingFingerprint() {
  //   return this.stored.preference.fingerprint || false
  // }
  //
  // async setUsingFingerprint(willEnable: boolean) {
  //   if (this.isUsingFingerprint() === willEnable) {
  //     return
  //   }
  //   if (willEnable) {
  //     await this.keychainTouchId.save('_mnemonic', await this.getMnemonic())
  //     this.stored.keys.mnemonic = ''
  //   } else {
  //     this.stored.keys.mnemonic = await this.getMnemonic()
  //   }
  //   this.stored.preference.fingerprint = willEnable
  //   return await this.updateStorage()
  // }

  //unit

  getSupportedCurrencies() {
    return Object.keys(this.UNITS).slice(2)
  }

  getPreferedCurrency() {
    return this.stored.preference.currency
  }

  setPreferedCurrency(sym: string) {
    // if (this.getSupportedCurrencies().indexOf(sym) === -1) {
    //   return Promise.resolve()
    // }
    this.stored.preference.currency = sym
    setImmediate(() => {
      this.events.publish('wallet:preferedcurrency', sym)
    })
    return this.updateStorage()
  }

  getUnits() {
    return this.units.concat([this.stored.preference.currency])
  }

  convertUnit(from: string, to: string, amountStr: string) {
    let amount: number = parseFloat(amountStr)
    if (isNaN(amount)) {
      return undefined
    }
    // if (from === to) {
    //   return amountStr
    // }
    let fromUnit = this.UNITS[from]
    let toUnit = this.UNITS[to]
    if (fromUnit && toUnit && fromUnit.rate && toUnit.rate) {
      return (amount / fromUnit.rate * toUnit.rate).toFixed(toUnit.dp) // string
    } else {
      return undefined
    }
  }

  // address format

  getPreferedAddressFormat() {
    return this.stored.preference.addressFormat
  }

  setPreferedAddressFormat(af: string) {
    if (af !== 'cashaddr' && af !== 'legacy') {
      return Promise.resolve()
    }
    this.stored.preference.addressFormat = af
    setImmediate(() => {
      this.events.publish('wallet:preferedaddressformat', af)
    })
    return this.updateStorage()
  }

  getAddressFormat(address: string) {
    if (this.validateAddress(address, 'legacy')) {
      return 'legacy'
    }
    if (this.validateAddress(address, 'cashaddr')) {
      return 'cashaddr'
    }
    if (this.validateAddress(address, 'bitpay')) {
      return 'bitpay'
    }
    return undefined
  }

  convertAddress(from: string, to: string, address: string) {
    from = from || this.getAddressFormat(address)
    if (!address || this.supportedAddressFormats.indexOf(from) === -1 || this.supportedAddressFormats.indexOf(to) === -1) {
      return undefined
    }
    if (from === to) {
      return address
    }
    if (from === 'cashaddr' && address.indexOf('bitcoincash:') !== 0) {
      address = 'bitcoincash:' + address
    }
    let result: string = bitcoincash.Address.fromString(address, '', '', from).toString(to)
    if (to === 'cashaddr') {
      result = result.slice(12)
    }
    return result
  }

  //storage

  updateStorage(obj?: any) {
    let value: any = obj || this.stored
    return this.storage.set(this.WALLET_KEY, value).then(() => {
      return value
    })
  }

  //wallet states

  changeState(s: number) {
    console.log('state: '+s)
    this.state = s
    if (s === this.STATE.CLOSED) {
      this.events.publish('wallet:closed')
    } else if (s === this.STATE.OFFLINE) {
      this.events.publish('wallet:offline')
      this.events.publish('wallet:update')
    } else if (s === this.STATE.SYNCED) {
      this.events.publish('wallet:synced')
      this.events.publish('wallet:update')
    }
  }

  isClosed() {
    return this.state === this.STATE.CLOSED
  }

  isOffline() {
    return this.state === this.STATE.OFFLINE
  }

  isConnecting() {
    return this.state === this.STATE.CONNECTING
  }

  isOnline() {
    return this.state >= this.STATE.CONNECTED
  }

  isConnected() {
    return this.state === this.STATE.CONNECTED
  }

  isSyncing() {
    return this.state === this.STATE.SYNCING
  }

  isSynced() {
    return this.state === this.STATE.SYNCED
  }

  //wallet control

  closeWallet() {
    if (!this.isOffline() && !this.isClosed()) {
      this.socket.off('disconnect')
      this.socket.close()
    }
    this.changeState(this.STATE.CLOSED)
  }

  createWallet(m?: string) {
    let mnemonic: string = m || this.createMnemonic()
    let hdPrivateKey: bitcoincash.HDPrivateKey = this.getHDPrivateKeyFromMnemonic(mnemonic)
    let hdPublicKey: bitcoincash.HDPublicKey = hdPrivateKey.hdPublicKey
    let xpub: string = hdPublicKey.toString()
    let addresses: any = this.generateAddresses(hdPrivateKey)
    return this.updateStorage({
      keys: {
        mnemonic: mnemonic,
        xpub: xpub,
      },
      addresses: addresses,
      cache: {
        receiveAddress: addresses.receive[0],
        changeAddress: addresses.change[0],
        utxos: [],
        history: []
      },
      preference: {
        currency: 'USD',
        addressFormat: 'cashaddr',
        // fingerprint: false
      }
    }).then((value) => {
      console.log('successfully created new wallet')
      return value
    })
  }

  recoverWalletFromMnemonic(m: string) {
    this.closeWallet()
    return this.createWallet(m).then(() => {
      return this.startWallet()
    })
  }

  startWallet() {
    return this.loadWalletFromStorage().then(() => {
      this.tryToConnectAndSync() // hopefully will not throw error
      return // will not wait for connection
    })
  }

  loadWalletFromStorage() {
    return this.storage.get(this.WALLET_KEY).then((value) => {
      if (value) {
        console.log('wallet found in storage')
        return value
      } else {
        console.log('nothing found in storage, will create new wallet')
        return this.createWallet()
      }
    }).then((value) => {
      this.stored = value
      this.changeState(this.STATE.OFFLINE)
    }).catch((err: any) => {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Error',
        message: 'failed to load wallet from storage',
        buttons: ['ok']
      }).present()
      throw err
    })
  }

  tryToConnectAndSync() {
    this.socket = io(this.WS_URL, {
      // query: {
      //   xpub: this.stored.keys.xpub
      // },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 1,
      timeout: 10000,
      transports:['polling', 'websocket']
    })
    this.socket.on('connect', async () => {
      try {
        let challenge: any = await this.apiWS('challenge', {}, true)
        let challengeBuffer: any = Buffer.from(challenge, 'hex')
        let response: any
        let x: string = ''
        let i: number = 0
        while (x !== '000') {
          if (i++ % 100 === 0) {
            await this.delay(0)
          }
          response = crypto.randomBytes(128)
          x = crypto.createHash('sha256').update(challengeBuffer).update(response).digest('hex').slice(0, 3)
        }
        await this.apiWS('startwallet', {
          response: response.toString('hex'),
          xpub: this.stored.keys.xpub
        }, true)
        this.changeState(this.STATE.CONNECTED)
        let results: any[] = await Promise.all([
          this.apiWS('address.subscribe'),
          this.apiWS('price.subscribe'),
          this.syncEverything(true)
        ])
        this.updatePrice(results[1])
      } catch (err) {
        console.log(err)
        this.socket.close()
        this.changeState(this.STATE.OFFLINE)
      }
    })
    let timer: number
    this.socket.on('notification', (data) => {
      if (data.method === 'address.subscribe') {
        clearTimeout(timer)
        if (this.pendingAddresses.indexOf(data.params[0]) === -1) {
          this.pendingAddresses.push(data.params[0])
        }
        timer = setTimeout(() => {
          if (this.isSyncing() || !this.isOnline() || this.pendingAddresses.length === 0) {
            return
          }
          this.syncEverything().catch((err: any) => {
            console.log(err)
          })
        }, 100)
      } else if (data.method === 'price.subscribe') {
        this.updatePrice(data.params)
      }
    })
    this.socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        // will not reconnect automatically
        this.socket.close()
        this.changeState(this.STATE.OFFLINE)
      }
    })
    this.socket.on('reconnect_attempt', (n: number) => {
      this.changeState(this.STATE.CONNECTING)
    })
    this.socket.on('reconnect_failed', () => {
      this.socket.close()
      this.changeState(this.STATE.OFFLINE)
    })

    this.changeState(this.STATE.CONNECTING)
    this.socket.open()
  }

  async syncEverything(fullSync?: boolean) {
    this.changeState(this.STATE.SYNCING)

    let id: number = this.syncTaskId++
    let targetAddresses: string[] = fullSync ? undefined : this.pendingAddresses.slice()
    this.pendingAddresses.length = 0
    let results: any[] = await Promise.all([
      this.apiWS('finaladdresspair').then(result => this.generateNewAddresses(result)),
      this.apiWS('unusedreceiveaddress'),
      this.apiWS('unusedchangeaddress'),
      this.apiWS('utxos', { addresses: targetAddresses }),
      this.apiWS('history', { addresses: targetAddresses })
    ])
    Array.prototype.push.apply(this.stored.addresses.receive, results[0].receive)
    Array.prototype.push.apply(this.stored.addresses.change, results[0].change)
    if (!this.isMyReceiveAddress(results[1]) || !this.isMyChangeAddress(results[2])) {
      throw new Error('invalid address')
    }

    // identify new txs
    let allTxids: string[] = this.getAllTxids()
    let newTxs: any[]  = results[4].filter(tx => allTxids.indexOf(tx.txid) === -1)
    let oldTxs: any[]  = results[4].filter(tx => allTxids.indexOf(tx.txid) !== -1)
    let lastConfirmed: any = this.stored.cache.history.find(tx => typeof tx.timestamp !== 'undefined')
    if (typeof lastConfirmed !== 'undefined') {
      newTxs = newTxs.filter(tx => typeof tx.timestamp === 'undefined' || tx.timestamp >= lastConfirmed.timestamp)
    }
    let newTxids: string[] = newTxs.map(tx => tx.txid)

    let skipNotification: boolean = (allTxids.length === 0 && results[4].length > 1) || this.app.getRootNav().getActive().component.pageName === 'HistoryPage'
    if (!skipNotification) {
      newTxs.forEach((tx) => {
        if (tx.delta <= 0) {
          return
        }
        this.localNotifications.schedule({
          id: this.notificationId++,
          text: `received ${this.convertUnit('SATOSHIS', 'BCH', tx.delta.toString()).replace(/\.?0+$/,'')} BCH`,
          data: { page: 'HistoryPage', navParams: {} }
        })
      })
    }

    // new history
    let newHistory: any[]
    if (fullSync) {
      let oldUnconfirmed: any[] = this.stored.cache.history.filter(tx => typeof tx.timestamp === 'undefined')
      let newUnconfirmed: any[] = results[4].filter(tx => typeof tx.timestamp === 'undefined')
      let stillUnconfirmed: any[] = oldUnconfirmed.filter(otx => typeof newUnconfirmed.find(ntx => ntx.txid === otx.txid) !== 'undefined')
      let freshUnconfirmed: any[] = newUnconfirmed.filter(ntx => typeof stillUnconfirmed.find(stx => ntx.txid === stx.txid) === 'undefined')
      let newConfirmed: any[] = results[4].filter(tx => typeof tx.timestamp !== 'undefined')
      let unseenTxids: string[] = this.getUnseenTxids()
      newHistory = freshUnconfirmed.concat(stillUnconfirmed).concat(newConfirmed).map((tx) => {
        return {
          txid: tx.txid,
          timestamp: tx.timestamp,
          delta: tx.delta,
          seen: unseenTxids.indexOf(tx.txid) === -1
        }
      })
    } else {
      let h1: any[] = newTxs.map((tx) => {
        return {
          txid: tx.txid,
          timestamp: tx.timestamp,
          delta: tx.delta,
          seen: false
        }
      })
      let h2: any[] = this.stored.cache.history.map((h) => {
        let match: any = oldTxs.find(tx => tx.txid === h.txid)
        if (typeof match === 'undefined') {
          return h
        }
        return {
          txid: match.txid,
          timestamp: match.timestamp,
          delta: match.delta,
          seen: h.seen
        }
      })
      newHistory = h1.concat(h2).slice(0, 30)
    }

    // new utxos
    let newUtxos: any[]
    if (fullSync) {
      newUtxos = results[3].map((obj: any) => {
        return {
          txid: obj.txid,
          vout: obj.vout,
          address: obj.address,
          //path relies on up-to-date this.stored.addresses
          path: this.getAddressTypeAndIndex(obj.address),
          scriptPubKey: obj.scriptPubKey,
          satoshis: obj.satoshis
        }
      }).filter(utxo => typeof utxo.path !== 'undefined')
    } else {
      let futxos: any[] = results[3].filter((nutxo) => {
        return this.stored.cache.utxos.findIndex(outxo => outxo.txid === nutxo.txid && outxo.vout === nutxo.vout) === -1
      }).map((utxo) => {
        return {
          txid: utxo.txid,
          vout: utxo.vout,
          address: utxo.address,
          path: this.getAddressTypeAndIndex(utxo.address),
          scriptPubKey: utxo.scriptPubKey,
          satoshis: utxo.satoshis
        }
      }).filter(utxo => typeof utxo.path !== 'undefined')
      let rutxos: any[] = this.stored.cache.utxos.filter(outxo => targetAddresses.indexOf(outxo.address) === -1 || results[3].findIndex(nutxo => outxo.txid === nutxo.txid && outxo.vout === nutxo.vout) !== -1)
      newUtxos = rutxos.concat(futxos)
    }

    //update cache
    this.stored.cache = {
      receiveAddress: results[1],
      changeAddress: results[2],
      utxos: newUtxos,
      history: newHistory
    }
    // console.log(this.stored.cache)
    await this.updateStorage()
    if (!this.isSyncing()) {
      return
    }
    if (this.pendingAddresses.length > 0) {
      return await this.syncEverything()
    }
    this.changeState(this.STATE.SYNCED)
  }

  async generateNewAddresses(pair: any) {
    let newAddresses: any = { receive: [], change: [] }
    // let hdPublicKey: bitcoincash.HDPublicKey = this.getHDPublicKey()
    // let d: bitcoincash.HDPublicKey[] = [hdPublicKey.derive(0), hdPublicKey.derive(1)]

    if (pair.receive === this.stored.addresses.receive.length - 1 && pair.change === this.stored.addresses.change.length - 1) {
        return newAddresses
    }
    let hdPrivateKey: bitcoincash.HDPrivateKey = this.getHDPrivateKeyFromMnemonic(await this.getMnemonic())
    let d: bitcoincash.HDPrivateKey[] = [hdPrivateKey.derive(0), hdPrivateKey.derive(1)]
    for (let i = this.stored.addresses.receive.length; i <= pair.receive; i++) {
      await this.delay(0)
      newAddresses.receive.push(d[0].derive(i).privateKey.toAddress().toString())
    }
    for (let i = this.stored.addresses.change.length; i <= pair.change; i++) {
      await this.delay(0)
      newAddresses.change.push(d[1].derive(i).privateKey.toAddress().toString())
    }
    return newAddresses
  }

  updatePrice(price: any) {
    for (let k in price) {
      if (this.UNITS[k]) {
        this.UNITS[k].rate = price[k]
      } else {
        this.UNITS[k] = {rate: price[k], dp: 2}
      }
    }
  }

  //event subscription

  subscribeUpdate(callback: Function) {
    if (this.state >= this.STATE.OFFLINE) {
      callback()
    }
    this.events.subscribe('wallet:update', callback)
    console.log('subscribeUpdate')
  }

  unsubscribeUpdate(callback: Function) {
    let result = this.events.unsubscribe('wallet:update', callback)
    console.log('unsubscribeUpdate: '+result)
  }

  subscribePreferedCurrency(callback: Function) {
    this.events.subscribe('wallet:preferedcurrency', callback)
    console.log('subscribePreferedCurrency')
  }

  unsubscribePreferedCurrency(callback: Function) {
    let result = this.events.unsubscribe('wallet:preferedcurrency', callback)
    console.log('unsubscribePreferedCurrency: '+result)
  }

  subscribePreferedAddressFormat(callback: Function) {
    this.events.subscribe('wallet:preferedaddressformat', callback)
    console.log('subscribePreferedAddressFormat')
  }

  unsubscribePreferedAddressFormat(callback: Function) {
    let result = this.events.unsubscribe('wallet:preferedaddressformat', callback)
    console.log('unsubscribePreferedAddressFormat: '+result)
  }

  //helper

  delay(ms: number) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve()
      }, ms)
    })
  }

  createMnemonic() {
    return new bitcoincash.Mnemonic().phrase
  }

  generateAddresses(hdPrivateKey: bitcoincash.HDPrivateKey) {
    let d: bitcoincash.HDPrivateKey[] = [hdPrivateKey.derive(0), hdPrivateKey.derive(1)]
    let addresses: any = { receive: [], change: [] }
    for (let i: number = 0; i < 20; i++) {
      addresses.receive[i] = d[0].derive(i).privateKey.toAddress().toString()
      addresses.change[i] = d[1].derive(i).privateKey.toAddress().toString()
    }
    return addresses
  }

  getHDPrivateKeyFromMnemonic(m: string) {
    return new bitcoincash.Mnemonic(m).toHDPrivateKey()
      .derive(44, true)
      .derive(145, true)
      .derive(0, true)
  }

  validateMnemonic(m: string) {
    try {
      return bitcoincash.Mnemonic.isValid(m)
    } catch (err) {
      return false
    }
  }

  validateXpub(xpub: string) {
    try {
      new bitcoincash.HDPublicKey(xpub)
      return true
    } catch (err) {
      return false
    }
  }

  validateWIF(wif: string) {
    try {
      new bitcoincash.PrivateKey(wif)
      return true
    } catch (err) {
      return false
    }
  }

  validateAddress(address: string, format?: string) {
    try {
      if (format === 'cashaddr' && address.indexOf('bitcoincash:') !== 0) {
        address = 'bitcoincash:' + address
      }
      bitcoincash.Address.fromString(address, '', '', format || 'legacy')
      return true
    } catch (err) {
      return false
    }
    // return bitcoincash.Address.isValid(a)
  }

  isMyReceiveAddress(address: string) {
    return typeof this.getAddressTypeAndIndex(address, 0) !== 'undefined'
  }

  isMyChangeAddress(address: string) {
    return typeof this.getAddressTypeAndIndex(address, 1) !== 'undefined'
  }

  scriptFromAddress(address: string) {
    return bitcoincash.Script.buildPublicKeyHashOut(bitcoincash.Address.fromString(address))
  }

  getAddressTypeAndIndex(address: string, type?: number) {
    if (typeof type === 'undefined' || type === 0) {
      let ra: string[] = this.stored.addresses.receive
      let ras: number = Math.max(0, ra.length - this.ADDRESS_LIMIT)
      let i = ra.indexOf(address, ras)
      if (i !== -1) {
        return [0, i]
      }
    }
    if (typeof type === 'undefined' || type === 1) {
      let ca: string[] = this.stored.addresses.change
      let cas: number = Math.max(0, ca.length - this.ADDRESS_LIMIT)
      let j = ca.indexOf(address, cas)
      if (j !== -1) {
        return [1, j]
      }
    }
    return undefined
  }

  getAllTxids() {
    return this.stored.cache.history.map(obj => obj.txid)
  }

  getUnseenTxids() {
    return this.stored.cache.history.filter(obj => !obj.seen).map(obj => obj.txid)
  }

  seeTheUnseen() {
    let touch: boolean = false
    this.stored.cache.history.forEach((obj: any) => {
      if (!touch && !obj.seen) {
        touch = true
      }
      obj.seen = true
    })
    if (touch) {
      return this.updateStorage()
    }
  }

  //getters

  getHDPublicKey() {
    return new bitcoincash.HDPublicKey(this.stored.keys.xpub)
  }

  getXpub() {
    return this.stored.keys.xpub
  }

  async getMnemonic() {
    // if (!this.isUsingFingerprint()) {
      return this.stored.keys.mnemonic
    // }
    // try {
    //   return await this.keychainTouchId.verify('_mnemonic','')
    // } catch (err) {
    //   if (err !== 'Cancelled') {
    //     this.alertCtrl.create({
    //       enableBackdropDismiss: false,
    //       title: 'Error',
    //       message: 'Fingerprint data is lost.<br>To recover this wallet, go to settings > more... > recover wallet',
    //       buttons: ['ok']
    //     }).present()
    //   }
    //   throw new Error('cancelled')
    // }
  }

  getPaymentRequestURL(address: string, sat?: number) {
    sat = sat > 0 ? sat : undefined
    let af: string = this.getAddressFormat(address)
    if (!af) {
      throw new Error('invalid address')
    }
    let uri: string = 'bitcoincash:' + address
    if (sat) {
      uri += '?amount=' + this.convertUnit('SATOSHIS', 'BCH', sat.toString()).replace(/\.?0+$/,'')
    }
    console.log(uri)
    return uri
  }

  getQR(text: string) {
    return QRCode.toDataURL(text, { margin: 1, errorCorrectionLevel: 'L' })
  }

  getRequestFromURL(text: string) {
    let params: any = {}
    let address: string
    let satoshis: number
    let url: string
    let label: string
    let message: string

    let missingPrefix: boolean = false
    if (text.indexOf('bitcoincash:') !== 0) {
      text = 'bitcoincash:' + text
      missingPrefix = true
    }

    let addr: string
    let i: number = text.indexOf('?')
    if (i === -1) {
      addr = text.slice(12)
    } else if (missingPrefix) {
        return
    } else {
      addr = text.slice(12, i)
    }
    if (typeof this.getAddressFormat(addr) !== 'undefined') {
      address = addr
    }
    if (typeof address === 'undefined' && i === -1) {
      return
    }

    let kvs: string[] = text.slice(i+1).split('&')
    let j: number = kvs.findIndex((kv: string) => {
      return kv.indexOf('req-') === 0
    })
    if (j !== -1) {
      return
    }

    kvs.forEach((kv) => {
      let s: string[] = kv.split('=', 2)
      params[s[0]] = s[1]
    })
    if (typeof params.amount !== 'undefined') {
      let amount: number = parseFloat(params.amount)
      if (amount > 0) {
        satoshis = parseFloat(this.convertUnit('BCH', 'SATOSHIS', amount.toString()))
      }
    }
    if (typeof params.r !== 'undefined') {
      url = decodeURIComponent(params.r)
    } else if (typeof address === 'undefined') {
      return
    }
    if (typeof params.label !== 'undefined') {
      label = decodeURIComponent(params.label)
    }
    if (typeof params.message !== 'undefined') {
      message = decodeURIComponent(params.message)
    }

    return {
      outputs: typeof address === 'undefined' ? [] : [{
        address: address,
        satoshis: satoshis
      }],
      url: url,
      label: label,
      message: message
    }
  }

  getInfoFromWIF(wif: string) {
    let sk: bitcoincash.PrivateKey = bitcoincash.PrivateKey(wif)
    let address: string = sk.toAddress().toString()
    return this.apiWS('utxos', {address: address}).then((result: any[]) => {
      let utxos: any[] = result.map((obj: any) => {
        return {
          txid: obj.txid,
          vout: obj.vout,
          address: obj.address,
          scriptPubKey: obj.scriptPubKey,
          satoshis: obj.satoshis
        }
      })
      return {
        address: address,
        balance: utxos.length > 0 ? utxos.map((curr) => curr.satoshis).reduce((acc, curr) => acc + curr) : 0,
        utxos: utxos
      }
    })
  }

  getAllReceiveAddresses() {
    return this.stored.addresses.receive.slice()
  }

  getAllChangeAddresses() {
    return this.stored.addresses.change.slice()
  }

  getCacheReceiveAddress() {
    return this.stored.cache.receiveAddress
  }

  getCacheChangeAddress() {
    return this.stored.cache.changeAddress
  }

  getCacheBalance() {
    let balance: number = 0
    this.stored.cache.utxos.forEach((utxo: any) => {
      balance += utxo.satoshis
    })
    return balance
  }

  getCacheHistory() {
    return this.stored.cache.history.slice()
  }

  getCacheUtxos() {
    return this.stored.cache.utxos.slice()
  }

  getTxFee(serialized: any) {
    let tx: bitcoincash.Transaction = new bitcoincash.Transaction(serialized)
    return  tx.inputAmount - tx.outputAmount
  }

  async getRequiredKeys(utxos: any[]) {
    let hdPrivateKey: bitcoincash.HDPrivateKey = this.getHDPrivateKeyFromMnemonic(await this.getMnemonic())
    let d: bitcoincash.HDPrivateKey[] = [hdPrivateKey.derive(0), hdPrivateKey.derive(1)]
    return utxos.map(utxo => d[utxo.path[0]].derive(utxo.path[1]).privateKey)
  }

  //tx

  async makeSignedTx(outputs: { script: bitcoincash.Script, satoshis: number }[], drain?: boolean, availableUtxos?: any[], keys?: bitcoincash.PrivateKey[]) {
    let satoshis: number = drain ? undefined : outputs.map(output => output.satoshis).reduce((acc, curr) => acc + curr)
    availableUtxos = availableUtxos || this.stored.cache.utxos
    if (availableUtxos.length === 0) {
      throw new Error('not enough fund')
    }
    let availableAmount: number = drain ? availableUtxos.map((curr) => curr.satoshis).reduce((acc, curr) => acc + curr) : 0

    let acc: number
    let utxos: any[]
    let toAmount: number
    let changeAmount: number
    let hex_tentative: string
    let fee_tentative: number = 0

    let loader = this.loadingCtrl.create({
      content: "signing..."
    })
    await loader.present()
    while (true) {
      if (drain) {
        acc = availableAmount
        utxos = availableUtxos
        toAmount = acc - fee_tentative
        changeAmount = 0
        if (toAmount < 546) {
          await loader.dismiss()
          throw new Error('not enough fund')
        }
      } else {
        let i: number = 0
        acc = 0
        utxos = []
        // if change is dust (<546), add 1 more utxo
        while (acc < satoshis + fee_tentative + 546 && i < availableUtxos.length) {
          let utxo: any = availableUtxos[i]
          acc += utxo.satoshis
          utxos.push(utxo)
          i++
        }
        toAmount = satoshis
        if (acc < toAmount + fee_tentative) {
          if (acc < toAmount) {
            await loader.dismiss()
            throw new Error('not enough fund')
          } else if (changeAmount === 0) {
            await loader.dismiss()
            throw new Error('not enough fund')
          } else {
            fee_tentative = 0
            changeAmount = 0
          }
        } else if (changeAmount !== 0) {
          changeAmount = acc - toAmount - fee_tentative
          if (changeAmount < 546) {
            fee_tentative = 0
            changeAmount = 0
          }
        }
      }
      let ustx: bitcoincash.Transaction = new bitcoincash.Transaction()
        .from(utxos.map(utxo => new bitcoincash.Transaction.UnspentOutput(utxo)))
      if (drain) {
        ustx.addOutput(new bitcoincash.Transaction.Output({
          script: outputs[0].script,
          satoshis: toAmount
        }))
      } else {
        outputs.forEach((output) => {
          ustx.addOutput(new bitcoincash.Transaction.Output({
            script: output.script,
            satoshis: output.satoshis
          }))
        })
      }
      if (changeAmount > 0) {
        ustx.fee(fee_tentative).change(this.stored.cache.changeAddress)
      }
      hex_tentative = this.signTx(ustx, keys || await this.getRequiredKeys(utxos))
      let fee_required: number = hex_tentative.length / 2
      // console.log(fee_tentative)
      // console.log(fee_required)
      // console.log(changeAmount)
      // console.log(hex_tentative)
      // console.log(new bitcoincash.Transaction(hex_tentative).toObject())
      if (fee_tentative >= fee_required) {
        break
      } else {
        fee_tentative = fee_required
      }
    }
    await loader.dismiss()
    return {
      satoshis: toAmount,
      fee: acc - toAmount - changeAmount,
      hex: hex_tentative
    }
  }

  async makeSweepTx(wif: string, info?: { address: string, balance: number, utxos: any[] }) {
    let keys: bitcoincash.PrivateKey[] = [bitcoincash.PrivateKey(wif)]
    if (!info) {
      info = await this.getInfoFromWIF(wif)
    }
    let output: any = {
      script: this.scriptFromAddress(this.stored.cache.receiveAddress),
      satoshis: 0
    }
    return await this.makeSignedTx([output], true, info.utxos, keys)
  }

  signTx(ustx: bitcoincash.Transaction, keys: bitcoincash.PrivateKey[]) {
    return ustx.sign(keys).serialize({
      disableDustOutputs: true,
      disableSmallFees: true
    })
  }

  async broadcastTx(signedTx: string) {
    let txid: any = await this.apiWS('broadcast', {tx: signedTx})
    return txid
  }

  // BIP70

  async getRequestFromMerchant(url: string) {
    let p0: Promise<ArrayBuffer> = this.http.get(url, {
      headers: {
        'Accept': 'application/bitcoincash-paymentrequest'
      },
      responseType: 'arraybuffer'
    }).toPromise()
    let p1: Promise<protobuf.Root> = protobuf.load('assets/paymentrequest.proto')
    let results: any[] = await Promise.all([p0, p1])

    let response: Uint8Array = new Uint8Array(results[0])
    let root: any = results[1]
    let PaymentRequest: any = root.lookupType("payments.PaymentRequest")
    let PaymentDetails: any = root.lookupType("payments.PaymentDetails")
    let paymentRequest: any = PaymentRequest.decode(response)
    let paymentDetails: any = PaymentDetails.decode(paymentRequest.serializedPaymentDetails)

    if (paymentDetails.network !== 'main') {
      throw new Error('unsupported network')
    }
    if (paymentDetails.expires > 0 && new Date().getTime() > paymentDetails.expires * 1000) {
      throw new Error('expired')
    }

    // return data
    let outputs: any = paymentDetails.outputs.map((output) => {
      return {
        satoshis: output.amount,
        script: new bitcoincash.Script(Array.prototype.map.call(output.script, x => ('00' + x.toString(16)).slice(-2)).join(''))
      }
    })
    let expires: number = paymentDetails.expires
    let memo: string = paymentDetails.memo
    let paymentUrl: string = paymentDetails.paymentUrl
    let merchantData: Uint8Array = paymentDetails.merchantData

    // cert
    let merchantName: string
    try {
      let X509Certificates: any = root.lookupType("payments.X509Certificates")
      let certData: Uint8Array = paymentRequest.pkiType.indexOf('x509') === 0 ? X509Certificates.decode(paymentRequest.pkiData).certificate[0] : undefined
      let certBuffer: ArrayBuffer = new ArrayBuffer(certData.length)
      let certBufferView: Uint8Array = new Uint8Array(certBuffer)
      certData.forEach((x, i) => {
        certBufferView[i] = x
      })
      let cert: pkijs.Certificate = new pkijs.Certificate({ schema: asn1js.fromBER(certBuffer).result })
      merchantName = cert.subject.typesAndValues.find(x => x.type === '2.5.4.3').value.valueBlock.value
    } catch (err) {
      console.log(err)
    }

    return {
      outputs: outputs,
      expires: expires,
      memo: memo,
      paymentUrl: paymentUrl,
      merchantData: merchantData,
      merchantName: merchantName,
      r: url,
      bip70: true
    }
  }

  async sendPaymentToMerchant(url: string, tx: string, refundAddress: string, merchantData?: Uint8Array) {
    let root: protobuf.Root = await protobuf.load('assets/paymentrequest.proto')
    let Output: any = root.lookupType("payments.Output")
    let Payment: any = root.lookupType("payments.Payment")
    let output: any = Output.create({
      amount: 0,
      script: bitcoincash.Script.buildPublicKeyHashOut(bitcoincash.Address.fromString(refundAddress)).toBuffer()
    })
    let payment: any = Payment.create({
      merchantData: merchantData,
      transactions: [new Uint8Array(tx.match(/.{1,2}/g).map(x => parseInt(x, 16)))],
      refundTo: [output],
      memo: undefined
    })

    let paymentMessageBuffer: any = Payment.encode(payment).finish()
    let ab: ArrayBuffer = new ArrayBuffer(paymentMessageBuffer.length)
    let abView: Uint8Array = new Uint8Array(ab)
    paymentMessageBuffer.forEach((x, i) => {
      abView[i] = x
    })

    let response: Uint8Array = new Uint8Array(await this.http.post(url, ab, {
      headers: {
        'Content-Type': 'application/bitcoincash-payment',
        'Accept': 'application/bitcoincash-paymentack'
      },
      responseType: 'arraybuffer'
    }).toPromise())
    let PaymentACK: any = root.lookupType("payments.PaymentACK")
    let paymentACK: any = PaymentACK.decode(response)

    return paymentACK.memo
  }

  //web socket

  apiWS(method: string, params?: any, force?: boolean, timeout?: number) {
    if (typeof method === 'undefined') {
      return Promise.reject(new Error('no method'))
    }
    if (typeof params === 'undefined') {
      params = {}
    }
    if (typeof force === 'undefined') {
      force = false
    }
    if (typeof timeout === 'undefined') {
      timeout = 30000
    }
    if (!force && !this.isOnline()) {
      return Promise.reject(new Error('not connected'))
    }
    return new Promise((resolve, reject) => {
      let id: number = this.socketRequestId++
      let cb: Function
      let timer: number

      cb = (data: any) => {
        if (data.id !== id) {
          return
        }
        clearTimeout(timer)
        this.socket.off('response', cb)
        if (typeof data.result !== 'undefined') {
          resolve(data.result)
        } else {
          try {
            reject(new Error(data.error.message))
          } catch (err) {
            reject(new Error('unknown error'))
          }
        }
      }

      this.socket.on('response', cb)
      timer = setTimeout(() => {
        this.socket.off('response', cb)
        reject(new Error('timeout'))
      }, timeout)
      this.socket.emit('request', {id: id, method: method, params: params})
    })
  }

}
