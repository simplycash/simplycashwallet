import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import 'rxjs/add/operator/catch'
import 'rxjs/add/operator/toPromise'
import { Storage } from '@ionic/storage'
import { TranslateService } from '@ngx-translate/core'
import { AlertController, App, Events, LoadingController, Platform, ToastController } from 'ionic-angular'
import { FingerprintAIO } from '@ionic-native/fingerprint-aio'
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { LocalNotifications } from '@ionic-native/local-notifications'
import { SplashScreen } from '@ionic-native/splash-screen'
import 'rxjs/add/operator/timeout'
import QRCode from 'qrcode'
import * as bitcoincash from 'bitcoincashjs'
import io from 'socket.io-client'
import * as protobuf from 'protobufjs'
import * as forge from 'node-forge'
import * as crypto from 'crypto-browserify'
import { Buffer } from 'buffer'


@Injectable()
export class Wallet {
  public DUMMY_KEY: string = 'well... at least better than plain text ¯\\_(ツ)_/¯'
  public STATE: any = Object.freeze({ CLOSED: 1, OFFLINE: 2, CONNECTING: 3, CONNECTED: 4, SYNCING: 5, SYNCED: 6 })
  public WALLET_KEY: string = '_wallet'
  public ADDRESS_LIMIT: number = 100

  public UNITS: { [key: string]: { rate: number, dp: number } } = {
    'BSV': { rate: 1, dp: 8 },
    'BITS': { rate: 1e6, dp: 2 },
    'SATS': { rate: 1e8, dp: 0 }
  }

  public ANNOUNCEMENT_URL: string = 'https://simply.cash/announcement.json'
  public WS_URL: string = 'https://ws.simply.cash:3000'
  public VERSION: string = '0.0.56'

  public supportedAddressFormats: string[] = ['legacy', 'cashaddr', 'bitpay']

  public isPaused: boolean = false
  public socket: any
  public socketRequestId: number = 0

  public state: number = this.STATE.CLOSED
  public syncTaskId: number = 0
  public pendingAddresses: string[] = []
  public notificationId: number = 0

  public stored: {
    keys: {
      encMnemonic: string,
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
        friendlyTimestamp: number,
        delta: number,
        seen: boolean
      }[]
    },
    preference: {
      showBalance: boolean,
      unitIndex: number,
      cryptoUnit: string,
      currency: string,
      addressFormat: string,
      password: boolean,
      fingerprint: boolean,
      lastAnnouncement: string
    }
  }
  public defaultPreference: any = {
    showBalance: true,
    unitIndex: 0,
    cryptoUnit: 'BSV',
    currency: 'USD',
    addressFormat: 'legacy',
    password: false,
    fingerprint: false,
    lastAnnouncement: ''
  }

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    public events: Events,
    public http: HttpClient,
    public faio: FingerprintAIO,
    public iab: InAppBrowser,
    public loadingCtrl: LoadingController,
    public localNotifications: LocalNotifications,
    public platform: Platform,
    public splashScreen: SplashScreen,
    public storage: Storage,
    public toastCtrl: ToastController,
    public translate: TranslateService
  ) {
    this.platform.pause.subscribe(() =>{
      this.isPaused = true
    })
    this.platform.resume.subscribe(() =>{
      this.isPaused = false
      if (this.isOffline()) {
        this.showAnnouncement()
        this.tryToConnectAndSync()
      }
    })
  }

  //authorize

  async authorize(): Promise<string> {
    await this.delay(0)
    let p: string = this.getPreferredProtection()
    if (p === 'OFF') {
      return this.getMnemonic()
    } else if (p === 'FINGERPRINT') {
      // intended
      if (await this.canUseFingerprint()) {
        return await this.authorizeFingerprint()
      }
    } else if (p === 'PIN') {
      return await this.authorizePIN()
    }
  }

  getSupportedProtections() {
    return ['OFF', 'PIN', 'FINGERPRINT']
  }

  getPreferredProtection() {
    if (this.stored.preference.password === true) {
      return 'PIN'
    }
    if (this.stored.preference.fingerprint === true) {
      return 'FINGERPRINT'
    }
    return 'OFF'
  }

  async setPreferredProtection(p: string, m: string) {
    if (p === 'PIN') {
      let pw = await this.newPIN()
      let cipher = crypto.createCipher('aes192', pw)
      let encrypted: string = cipher.update(m, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      this.stored.keys.encMnemonic = encrypted
      this.stored.preference.password = true
      this.stored.preference.fingerprint = false
    } else if (p === 'FINGERPRINT') {
      if (!await this.canUseFingerprint()) {
        await this.fingerprintNAPrompt()
        throw new Error('auth unavailable')
      }
      let cipher = crypto.createCipher('aes192', this.DUMMY_KEY)
      let encrypted: string = cipher.update(m, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      this.stored.keys.encMnemonic = encrypted
      this.stored.preference.password = false
      this.stored.preference.fingerprint = true
    } else if (p === 'OFF') {
      let cipher = crypto.createCipher('aes192', this.DUMMY_KEY)
      let encrypted: string = cipher.update(m, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      this.stored.keys.encMnemonic = encrypted
      this.stored.preference.password = false
      this.stored.preference.fingerprint = false
    }
    return await this.updateStorage()
  }

  //pin

  newPIN() {
    return new Promise<string>((resolve, reject) => {
      let pinAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'PIN',
        inputs: [{
          name: 'pin1',
          type: 'password',
          placeholder: this.translate.instant('ENTER_PIN')
        },{
          name: 'pin2',
          type: 'password',
          placeholder: this.translate.instant('CONFIRM_PIN')
        }],
        buttons: [{
          text: this.translate.instant('CANCEL'),
          handler: data => {
            pinAlert.dismiss().then(() => {
              reject(new Error('cancelled'))
            })
            return false
          }
        },{
          text: this.translate.instant('OK'),
          handler: data => {
            if (data.pin1.length > 0 && data.pin1 === data.pin2) {
              pinAlert.dismiss().then(() => {
                resolve(data.pin1)
              })
            } else {
              this.alertCtrl.create({
                enableBackdropDismiss: false,
                title: this.translate.instant('ERROR'),
                message: this.translate.instant('ERR_INCORRECT_PIN'),
                buttons: ['ok']
              }).present()
            }
            return false
          }
        }]
      })
      pinAlert.present()
    })
  }

  authorizePIN(): Promise<string> {
    return new Promise((resolve, reject) => {
      let pinAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'PIN',
        inputs: [{
          name: 'pin',
          type: 'password',
          placeholder: this.translate.instant('ENTER_PIN')
        }],
        buttons: [{
          text: this.translate.instant('CANCEL'),
          handler: data => {
            pinAlert.dismiss().then(() => {
              reject(new Error('cancelled'))
            })
            return false
          }
        },{
          text: this.translate.instant('OK'),
          handler: data => {
            let m: string
            try {
              m = this.getMnemonic(data.pin)
              pinAlert.dismiss().then(() => {
                resolve(m)
              })
            } catch (err) {
              this.alertCtrl.create({
                enableBackdropDismiss: false,
                title: this.translate.instant('ERROR'),
                message: this.translate.instant('ERR_INCORRECT_PIN'),
                buttons: ['ok']
              }).present()
            }
            return false
          }
        }]
      })
      pinAlert.present()
    })
  }

  //fingerprint

  async canUseFingerprint() {
    try {
      if (this.platform.is('cordova') && -1 !== ['finger', 'face'].indexOf(await this.faio.isAvailable())) {
        return true
      } else {
        return false
      }
    } catch (err) {
      return false
    }
  }

  fingerprintNAPrompt() {
    return new Promise((resolve, reject) => {
      let naAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_AUTH_UNAVAILABLE'),
        buttons: [{
          text: this.translate.instant('OK'),
          handler: data => {
            naAlert.dismiss().then(() => {
              resolve()
            })
            return false
          }
        }]
      })
      naAlert.present()
    })
  }

  authorizeFingerprint(): Promise<string> {
    return this.faio.show({
      clientId: 'wallet owner',
      clientSecret: 'cash.simply.wallet.dummy.password', //Only necessary for Android
      disableBackup: false,  //Only for Android(optional)
      localizedFallbackTitle: 'PIN', //Only for iOS
      //localizedReason: 'Please authenticate' //Only for iOS
    }).then(() => {
      return this.getMnemonic()
    }).catch((err: any) => {
      throw new Error('cancelled')
    })
  }

  //show balance
  getShowBalance() {
    return this.stored.preference.showBalance
  }

  setShowBalance(s: boolean) {
    this.stored.preference.showBalance = s
    return this.updateStorage()
  }

  //unit

  getSupportedCryptoUnits() {
    return Object.keys(this.UNITS).slice(0, 3)
  }

  getSupportedCurrencies() {
    return Object.keys(this.UNITS).slice(3)
  }

  getPreferredCryptoUnit() {
    return this.stored.preference.cryptoUnit
  }

  setPreferredCryptoUnit(sym: string) {
    this.stored.preference.cryptoUnit = sym
    setImmediate(() => {
      this.events.publish('wallet:preferredcryptounit', sym)
      this.events.publish('wallet:preferredunit', this.getPreferredUnit())
    })
    return this.updateStorage()
  }

  getPreferredCurrency() {
    return this.stored.preference.currency
  }

  setPreferredCurrency(sym: string) {
    // if (this.getSupportedCurrencies().indexOf(sym) === -1) {
    //   return Promise.resolve()
    // }
    this.stored.preference.currency = sym
    setImmediate(() => {
      this.events.publish('wallet:preferredcurrency', sym)
      this.events.publish('wallet:preferredunit', this.getPreferredUnit())
    })
    return this.updateStorage()
  }

  getPreferredUnit() {
    return this.getUnits()[this.stored.preference.unitIndex]
  }

  changePreferredUnit() {
    let units = this.getUnits()
    this.stored.preference.unitIndex = (this.stored.preference.unitIndex + 1) % units.length
    let punit = units[this.stored.preference.unitIndex]
    setImmediate(() => {
      this.events.publish('wallet:preferredunit', punit)
      this.updateStorage()
    })
    return punit
  }

  getUnits() {
    return [
      this.stored.preference.cryptoUnit,
      this.stored.preference.currency
    ]
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

  getPreferredAddressFormat() {
    return this.stored.preference.addressFormat
  }

  setPreferredAddressFormat(af: string) {
    if (af !== 'cashaddr' && af !== 'legacy') {
      return Promise.resolve()
    }
    this.stored.preference.addressFormat = af
    setImmediate(() => {
      this.events.publish('wallet:preferredaddressformat', af)
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

    let cipher = crypto.createCipher('aes192', this.DUMMY_KEY)
    let encrypted: string = cipher.update(mnemonic, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    let obj: any = {
      keys: {
        encMnemonic: encrypted,
        xpub: xpub,
      },
      addresses: addresses,
      cache: {
        receiveAddress: addresses.receive[0],
        changeAddress: addresses.change[0],
        utxos: [],
        history: []
      },
      preference: Object.assign({}, this.defaultPreference)
    }

    return this.updateStorage(obj).then((value) => {
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
      this.showAnnouncement()
      this.tryToConnectAndSync() // hopefully will not throw error
      return // will not wait for connection
    })
  }

  async loadWalletFromStorage() {
    let value: any = await this.storage.get(this.WALLET_KEY)
    if (!value) {
      console.log('nothing found in storage, will create new wallet')
      value = await this.createWallet()
    } else {
      console.log('wallet found in storage')
      let willUpdate = false
      if (value.keys.hasOwnProperty('mnemonic') && !value.keys.hasOwnProperty('encMnemonic')) {
        let cipher = crypto.createCipher('aes192', this.DUMMY_KEY)
        let encrypted: string = cipher.update(value.keys.mnemonic, 'utf8', 'hex')
        encrypted += cipher.final('hex')
        delete value.keys.mnemonic;
        value.keys.encMnemonic = encrypted
        willUpdate = true
      }
      if (value.preference.hasOwnProperty('pin')) {
        if (typeof value.preference.pin === 'undefined' || value.preference.pin === null) {
          value.preference.password = false
        } else {
          let decipher = crypto.createDecipher('aes192', this.DUMMY_KEY)
          let decrypted: string = decipher.update(value.keys.encMnemonic, 'hex', 'utf8')
          decrypted += decipher.final('utf8')
          let cipher = crypto.createCipher('aes192', value.preference.pin)
          let encrypted: string = cipher.update(decrypted, 'utf8', 'hex')
          encrypted += cipher.final('hex')
          value.keys.encMnemonic = encrypted
          value.preference.password = true
        }
        delete value.preference.pin;
        willUpdate = true
      }
      if (value.preference.hasOwnProperty('pinHash')) {
        if (typeof value.preference.pinHash === 'undefined' || value.preference.pinHash === null) {
          value.preference.password = false
        } else {
          this.splashScreen.hide()
          let pw = await new Promise((resolve, reject) => {
            let pinAlert = this.alertCtrl.create({
              enableBackdropDismiss: false,
              title: 'PIN',
              inputs: [{
                name: 'pin',
                type: 'password',
                placeholder: this.translate.instant('ENTER_PIN')
              }],
              buttons: [{
                text: this.translate.instant('OK'),
                handler: data => {
                  let p = value.preference.pinHash.split(':')
                  let salt = Buffer.from(p[0], 'hex')
                  let hash = crypto.createHash('sha256').update(salt).update(data.pin, 'utf8').digest('hex')
                  let r = p[0] + ':' + hash
                  if (r === value.preference.pinHash) {
                    pinAlert.dismiss().then(() => {
                      resolve(data.pin)
                    })
                  } else {
                    this.alertCtrl.create({
                      enableBackdropDismiss: false,
                      title: this.translate.instant('ERROR'),
                      message: this.translate.instant('ERR_INCORRECT_PIN'),
                      buttons: ['ok']
                    }).present()
                  }
                  return false
                }
              }]
            })
            pinAlert.present()
          })
          let decipher = crypto.createDecipher('aes192', this.DUMMY_KEY)
          let decrypted: string = decipher.update(value.keys.encMnemonic, 'hex', 'utf8')
          decrypted += decipher.final('utf8')
          let cipher = crypto.createCipher('aes192', pw)
          let encrypted: string = cipher.update(decrypted, 'utf8', 'hex')
          encrypted += cipher.final('hex')
          value.keys.encMnemonic = encrypted
          value.preference.password = true
        }
        delete value.preference.pinHash;
        willUpdate = true
      }
      if (value.preference.hasOwnProperty('chain')) {
        delete (value.preference as any).chain
        willUpdate = true
      }
      if (value.preference.cryptoUnit === 'BCH') {
        value.preference.cryptoUnit = 'BSV'
        willUpdate = true
      }
      if (value.preference.addressFormat !== 'legacy') {
        value.preference.addressFormat = 'legacy'
        willUpdate = true
      }
      if (willUpdate) {
        value = await this.updateStorage(value)
      }
    }
    Object.keys(this.defaultPreference).forEach((k) => {
      if (typeof value.preference[k] === 'undefined') {
        value.preference[k] = this.defaultPreference[k]
      }
    })
    this.stored = value
    this.changeState(this.STATE.OFFLINE)
  }

  async showAnnouncement() {
    let ann: string
    try {
      let o = await this.http.get(this.ANNOUNCEMENT_URL).toPromise()
      let v = o[this.VERSION] || o['default']
      ann = v[(window as any).translationLanguage] || v['en']
    } catch (err) {
      console.log(err)
    }
    if (!ann || this.stored.preference.lastAnnouncement === ann) {
      return
    }
    let annAlert = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('ANNOUNCEMENT'),
      message: ann,
      buttons: [{
        text: this.translate.instant('DO_NOT_SHOW_AGAIN'),
        handler: () => {
          this.stored.preference.lastAnnouncement = ann
          this.updateStorage()
        }
      },{
        text: this.translate.instant('OK')
      }]
    })
    await annAlert.present()
  }

  tryToConnectAndSync() {
    this.socket = io(this.WS_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 1,
      timeout: 10000,
      transports:['polling', 'websocket']
    })
    this.socket.on('connect', async () => {
      try {
        let challenge: any = await this.apiWS('challengev2', {
          version: this.VERSION
        }, true)
        let challengeBuffer: any = Buffer.from(challenge.nonce, 'hex')
        let response: any = Buffer.alloc(4)
        let x: string = ''
        let i: number = 0
        while (i < 4294967296) {
          response.writeUInt32LE(i)
          x = crypto.createHash('sha256').update(challengeBuffer).update(response).digest('hex').slice(0, challenge.target.length)
          if (x <= challenge.target) {
            break
          }
          if (++i % 100 === 0) {
            await this.delay(0)
          }
        }
        await this.apiWS('startwallet', {
          response: response.toString('hex'),
          xpub: this.stored.keys.xpub
        }, true)
        this.changeState(this.STATE.CONNECTED)
        await Promise.all([
          this.apiWS('price.subscribe').then((price) => {this.updatePrice(price)}),
          this.apiWS('address.subscribe'),
          this.syncEverything(true)
        ])
      } catch (err) {
        console.log(err)
        this.socket.close()
        this.changeState(this.STATE.OFFLINE)
        if (err.message === 'update') {
          this.showUpdateAlert()
        }
      }
    })
    let timer: number
    this.socket.on('notification', (data) => {
      if (data.method === 'address.subscribe') {
        window.clearTimeout(timer)
        if (this.pendingAddresses.indexOf(data.params[0]) === -1) {
          this.pendingAddresses.push(data.params[0])
        }
        timer = window.setTimeout(() => {
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
      if (reason === 'io server disconnect' || this.isPaused) {
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

    this.syncTaskId++
    let targetAddresses: string[] = fullSync ? undefined : this.pendingAddresses.slice()
    this.pendingAddresses.length = 0
    let results: any[] = await Promise.all([
      this.apiWS('finaladdresspair').then(result => this.syncAddresses(result)),
      this.apiWS('unusedreceiveaddress'),
      this.apiWS('unusedchangeaddress'),
      this.apiWS('utxos', { addresses: targetAddresses }),
      this.apiWS('history', { addresses: targetAddresses })
    ])

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
      let unit: string = this.getPreferredUnit()
      let isCordova: boolean = this.platform.is('cordova')
      newTxs.forEach((tx) => {
        if (tx.delta <= 0) {
          return
        }
        let msg: string = `${this.translate.instant('RECEIVED')} ${(this.convertUnit('SATS', unit, tx.delta.toString()) || '').replace(/\.?0+$/,'')} ${unit}`
        if (isCordova) {
          this.localNotifications.schedule({
            id: this.notificationId++,
            text: msg,
            data: { page: 'HistoryPage', navParams: {} },
            foreground: true // need to modify @ionic-native/local-notifications ILocalNotification interface
          })
        } else {
          this.toastCtrl.create({
            message: msg,
            position: 'bottom',
            duration: 3000
          }).present()
        }
      })
    }

    // new history
    let currentTimestamp: number = Math.floor(new Date().getTime() / 1000)
    let newHistory: any[]
    if (fullSync) {
      let oldUnconfirmed: any[] = this.stored.cache.history.filter(tx => typeof tx.timestamp === 'undefined')
      let newUnconfirmed: any[] = results[4].filter(tx => typeof tx.timestamp === 'undefined')
      let stillUnconfirmed: any[] = oldUnconfirmed.filter(otx => typeof newUnconfirmed.find(ntx => ntx.txid === otx.txid) !== 'undefined')
      let freshUnconfirmed: any[] = newUnconfirmed.filter(ntx => typeof stillUnconfirmed.find(stx => ntx.txid === stx.txid) === 'undefined')

      let oldConfirmed: any[] = this.stored.cache.history.filter(tx => typeof tx.timestamp !== 'undefined')
      let newConfirmed: any[] = results[4].filter(tx => typeof tx.timestamp !== 'undefined')
      newConfirmed = newConfirmed.map(n => oldUnconfirmed.find(o => o.txid === n.txid) || n)
      let stillConfirmed: any[] = oldConfirmed.filter(otx => typeof newConfirmed.find(ntx => ntx.txid === otx.txid) !== 'undefined')
      let freshConfirmed: any[] = newConfirmed.filter(ntx => typeof stillConfirmed.find(stx => ntx.txid === stx.txid) === 'undefined')

      let unseenTxids: string[] = this.getUnseenTxids().concat(newTxids)
      newHistory = freshUnconfirmed.concat(stillUnconfirmed).concat(freshConfirmed).concat(stillConfirmed).map((tx) => {
        return {
          txid: tx.txid,
          timestamp: tx.timestamp,
          friendlyTimestamp: tx.friendlyTimestamp || (tx.timestamp ? Math.min(tx.timestamp, currentTimestamp) : currentTimestamp),
          delta: tx.delta,
          seen: unseenTxids.indexOf(tx.txid) === -1
        }
      })
    } else {
      let h1: any[] = newTxs.map((tx) => {
        return {
          txid: tx.txid,
          timestamp: tx.timestamp,
          friendlyTimestamp: currentTimestamp,
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
          friendlyTimestamp: h.friendlyTimestamp,
          delta: match.delta,
          seen: h.seen
        }
      })
      newHistory = h1.concat(h2).slice(0, 30)
    }
    newHistory.forEach((h, i) => {
      h.tempIndex = i
    })
    newHistory.sort((a, b) => {
      // descending friendlyTimestamp
      let v = b.friendlyTimestamp - a.friendlyTimestamp
      if (v !== 0) {
        return v
      }
      // ascending tempIndex
      return a.tempIndex - b.tempIndex
    })
    newHistory.forEach((h) => {
      delete h.tempIndex
    })

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

  async syncAddresses(pair: any) {
    let newAddresses: any = { receive: [], change: [] }

    this.stored.addresses.receive.length = Math.min(pair.receive + 1, this.stored.addresses.receive.length)
    this.stored.addresses.change.length = Math.min(pair.change + 1, this.stored.addresses.change.length)

    if (pair.receive === this.stored.addresses.receive.length - 1 && pair.change === this.stored.addresses.change.length - 1) {
        return newAddresses
    }
    let hdPublicKey: bitcoincash.HDPublicKey = this.getHDPublicKey()
    let d: bitcoincash.HDPublicKey[] = [hdPublicKey.derive(0), hdPublicKey.derive(1)]
    // let hdPrivateKey: bitcoincash.HDPrivateKey = this.getHDPrivateKeyFromMnemonic(this.getMnemonic())
    // let d: bitcoincash.HDPrivateKey[] = [hdPrivateKey.derive(0), hdPrivateKey.derive(1)]
    for (let i = this.stored.addresses.receive.length; i <= pair.receive; i++) {
      await this.delay(0)
      newAddresses.receive.push(d[0].derive(i).publicKey.toAddress().toString())
    }
    for (let i = this.stored.addresses.change.length; i <= pair.change; i++) {
      await this.delay(0)
      newAddresses.change.push(d[1].derive(i).publicKey.toAddress().toString())
    }
    Array.prototype.push.apply(this.stored.addresses.receive, newAddresses.receive)
    Array.prototype.push.apply(this.stored.addresses.change, newAddresses.change)
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
    this.events.publish('wallet:price')
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

  subscribePrice(callback: Function) {
    this.events.subscribe('wallet:price', callback)
    console.log('subscribePrice')
  }

  unsubscribePrice(callback: Function) {
    let result = this.events.unsubscribe('wallet:price', callback)
    console.log('unsubscribePrice: '+result)
  }

  subscribePreferredUnit(callback: Function) {
    this.events.subscribe('wallet:preferredunit', callback)
    console.log('subscribePreferredUnit')
  }

  unsubscribePreferredUnit(callback: Function) {
    let result = this.events.unsubscribe('wallet:preferredunit', callback)
    console.log('unsubscribePreferredUnit: '+result)
  }

  //helper

  delay(ms: number) {
    return new Promise((resolve, reject) => {
      window.setTimeout(() => {
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

  getMnemonic(password?: string) {
      let decipher = crypto.createDecipher('aes192', password || this.DUMMY_KEY)
      let encrypted: string = this.stored.keys.encMnemonic
      let decrypted: string = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      if (this.validateMnemonic(decrypted)) {
        return decrypted
      } else {
        throw new Error('invalid password')
      }
  }

  getPaymentRequestURL(address: string, sat?: number) {
    sat = sat > 0 ? sat : undefined
    let af: string = this.getAddressFormat(address)
    if (!af) {
      throw new Error('invalid address')
    }
    let uri: string = 'bitcoincash:' + address
    if (sat) {
      uri += '?amount=' + this.convertUnit('SATS', 'BSV', sat.toString()).replace(/\.?0+$/,'')
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

    let missingPrefix: boolean
    if (text.slice(0, 12).toLowerCase() === 'bitcoincash:') {
      text = 'bitcoincash:' + text.slice(12)
      missingPrefix = false
    } else {
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
        satoshis = parseFloat(this.convertUnit('BSV', 'SATS', amount.toString()))
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

  getRequiredKeys(utxos: any[], m: string): bitcoincash.PrivateKey[] {
    let hdPrivateKey: bitcoincash.HDPrivateKey = this.getHDPrivateKeyFromMnemonic(m)
    let d: bitcoincash.HDPrivateKey[] = [hdPrivateKey.derive(0), hdPrivateKey.derive(1)]
    return utxos.map(utxo => d[utxo.path[0]].derive(utxo.path[1]).privateKey)
  }

  //tx

  async makeSignedTx(outputs: { script: bitcoincash.Script, satoshis: number }[], drain: boolean, m: string) {
    let au: any[] = this.getCacheUtxos()
    let ak: bitcoincash.PrivateKey[] = this.getRequiredKeys(au, m)
    return this._makeSignedTx(outputs, drain, au, ak)
  }

  async _makeSignedTx(outputs: { script: bitcoincash.Script, satoshis: number }[], drain: boolean, availableUtxos: any[], availableKeys: bitcoincash.PrivateKey[]) {
    let satoshis: number = drain ? undefined : outputs.map(output => output.satoshis).reduce((acc, curr) => acc + curr)
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

    while (true) {
      if (drain) {
        acc = availableAmount
        utxos = availableUtxos
        toAmount = acc - fee_tentative
        changeAmount = 0
        if (toAmount < 546) {
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
            throw new Error('not enough fund')
          } else if (changeAmount === 0) {
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
      hex_tentative = this.signTx(ustx, availableKeys)
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
    return await this._makeSignedTx([output], true, info.utxos, keys)
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
    if (1 + 1 === 2) {
      throw new Error('suspended')
    }
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
      let cert: any = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(certBuffer).toString('binary'))))
      merchantName = cert.subject.attributes.find(attr => attr.type === '2.5.4.3').value
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

  //update alert

  showUpdateAlert() {
    if (!this.platform.is('cordova')) {
      return
    }
    let updateAlert = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('PLEASE_UPDATE'),
      buttons: [{
        text: this.translate.instant('CANCEL')
      },{
        text: this.translate.instant('UPDATE'),
        handler: () => {
          let url: string
          if (this.platform.is('android')) {
            url = 'https://play.google.com/store/apps/details?id=cash.simply.wallet'
          } else {
            url = 'https://itunes.apple.com/app/id1398370340'
          }
          this.iab.create(url, '_system')
        }
      }]
    })
    updateAlert.present()
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
        window.clearTimeout(timer)
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
      timer = window.setTimeout(() => {
        this.socket.off('response', cb)
        reject(new Error('timeout'))
      }, timeout)
      this.socket.emit('request', {id: id, method: method, params: params})
    })
  }

}
