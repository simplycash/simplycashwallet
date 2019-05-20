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
import * as bitcoincash from 'bsv'
import * as bitcoincash_Mnemonic from 'bsv/mnemonic'
import * as bchaddr from 'bchaddrjs'
import * as bs58check from 'bs58check'
import io from 'socket.io-client'
import * as protobuf from 'protobufjs'
import * as crypto from 'crypto-browserify'
import * as jsrsasign from 'jsrsasign'
import { Buffer } from 'buffer/'
import * as BN from 'bn.js'

enum EState {
  CLOSED = 1,
  OFFLINE,
  CONNECTING,
  CONNECTED,
  SYNCING,
  SYNCED
}

interface IUnits {
  [key: string]: IUnit
}

interface IUnit {
  rate: number,
  dp: number
}

interface IAddresses {
  receive: string[],
  change: string[]
}

interface IUtxo {
  txid: string,
  vout: number,
  address?: string,
  path?: [number, number],
  scriptPubKey: string,
  satoshis: number
}

interface ITxRecord {
  txid: string,
  height: number,
  timestamp: number,
  friendlyTimestamp: number,
  delta: number,
  seen: boolean
}

interface IWallet {
  name: string,
  protection: string,
  keys: {
    encMnemonic: string,
    compliant: boolean,
    xpub: string
  },
  addresses: IAddresses,
  cache: {
    receiveAddress: string,
    changeAddress: string,
    utxos: IUtxo[],
    history: ITxRecord[]
  }
}

interface IPreference {
  defaultWallet: string,
  showBalance: boolean,
  unitIndex: number,
  cryptoUnit: string,
  currency: string,
  addressFormat: string,
  lastAnnouncement: string
}

interface IStorage {
  version: string
  wallets: IWallet[],
  preference: IPreference
}

interface IRecoveryInfo {
  mnemonic?: string,
  path?: string,
  passphrase?: string,
  xprv?: string
}

interface IInput {
  txid: string,
  vout: number,
  path?: [number, number],
  script: string,
  satoshis: number

}

interface IOutput {
  path?: [number, number],
  script: string,
  satoshis: number
}

interface IAddressOutput {
  address: string,
  satoshis: number
}

interface IRequest {
  outputs: IAddressOutput[],
  url?: string,
  label?: string,
  message?: string
}

interface IWifInfo {
  address: string,
  balance: number,
  utxos: IUtxo[]
}

interface ITransaction {
  satoshis: number,
  fee: number,
  hex: string,
  inputs: IInput[],
  outputs: IOutput[]
}

interface IBIP70Request {
  outputs: IOutput[],
  expires: number,
  memo: string,
  paymentUrl: string,
  merchantData: Uint8Array,
  merchantName: string,
  r: string,
  verified: boolean,
  bip70: boolean
}

@Injectable()
export class Wallet {
  public readonly DUMMY_KEY: string = 'well... at least better than plain text ¯\\_(ツ)_/¯'
  public readonly WALLET_KEY: string = '_wallet'

  public readonly UNITS: IUnits = {
    'BSV': { rate: 1, dp: 8 },
    'BITS': { rate: 1e6, dp: 2 },
    'SATS': { rate: 1e8, dp: 0 }
  }

  public readonly ANNOUNCEMENT_URL: string = 'https://simply.cash/announcement.json'
  public readonly WS_URL: string = 'https://ws.simply.cash:3000'
  public readonly VERSION: string = '0.0.87'

  public readonly supportedAddressFormats: ReadonlyArray<string> = ['legacy', 'cashaddr']
  public readonly supportedProtections: ReadonlyArray<string> = ['OFF', 'PIN', 'FINGERPRINT']

  public isPaused: boolean = false
  public socket: any
  public socketRequestId: number = 0

  public state: EState = EState.CLOSED
  public syncTaskId: number = 0
  public pendingAddresses: string[] = []
  public notificationId: number = 0

  public currentWallet: IWallet
  public stored: IStorage
  public defaultPreference: Readonly<IPreference> = {
    defaultWallet: '',
    showBalance: true,
    unitIndex: 0,
    cryptoUnit: 'BSV',
    currency: 'USD',
    addressFormat: 'legacy',
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
    this.platform.pause.subscribe(() => {
      this.isPaused = true
    })
    this.platform.resume.subscribe(() => {
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
      return this.getRecoveryString()
    } else if (p === 'FINGERPRINT') {
      // intended
      if (await this.canUseFingerprint()) {
        return await this.authorizeFingerprint()
      }
    } else if (p === 'PIN') {
      return await this.authorizePIN()
    }
  }

  getSupportedProtections(): string[] {
    return this.supportedProtections.slice()
  }

  getPreferredProtection(): string {
    if (this.currentWallet.protection === 'password') {
      return 'PIN'
    }
    if (this.currentWallet.protection === 'fingerprint') {
      return 'FINGERPRINT'
    }
    return 'OFF'
  }

  async setPreferredProtection(p: string, m: string): Promise<void> {
    if (p === 'PIN') {
      let pw: string = await this.newPIN()
      let encrypted: string = this._encryptText(m, pw)
      this.currentWallet.keys.encMnemonic = encrypted
      this.currentWallet.protection = 'password'
    } else if (p === 'FINGERPRINT') {
      if (!await this.canUseFingerprint()) {
        await this.fingerprintNAPrompt()
        throw new Error('auth unavailable')
      }
      let encrypted: string = this._encryptText(m, this.DUMMY_KEY)
      this.currentWallet.keys.encMnemonic = encrypted
      this.currentWallet.protection = 'fingerprint'
    } else if (p === 'OFF') {
      let encrypted: string = this._encryptText(m, this.DUMMY_KEY)
      this.currentWallet.keys.encMnemonic = encrypted
      this.currentWallet.protection = 'off'
    }
    await this.updateStorage()
  }

  //pin

  newPIN(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let pinAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('PIN'),
        inputs: [{
          name: 'pin1',
          type: 'password',
          placeholder: this.translate.instant('ENTER_PIN')
        }, {
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
        }, {
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
                buttons: [this.translate.instant('OK')]
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
    return new Promise<string>((resolve, reject) => {
      let pinAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('PIN'),
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
        }, {
          text: this.translate.instant('OK'),
          handler: data => {
            let m: string
            try {
              m = this.getRecoveryString(data.pin)
              pinAlert.dismiss().then(() => {
                resolve(m)
              })
            } catch (err) {
              this.alertCtrl.create({
                enableBackdropDismiss: false,
                title: this.translate.instant('ERROR'),
                message: this.translate.instant('ERR_INCORRECT_PIN'),
                buttons: [this.translate.instant('OK')]
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

  async canUseFingerprint(): Promise<boolean> {
    try {
      if (this.platform.is('cordova') && (await this.faio.isAvailable()).match(/^(finger|face)$/gi)) {
        return true
      } else {
        return false
      }
    } catch (err) {
      return false
    }
  }

  fingerprintNAPrompt(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
      return this.getRecoveryString()
    }).catch((err: any) => {
      throw new Error('cancelled')
    })
  }

  //show balance
  getShowBalance(): boolean {
    return this.stored.preference.showBalance
  }

  async toggleShowBalance(): Promise<void> {
    this.stored.preference.showBalance = !this.stored.preference.showBalance
    await this.updateStorage()
  }

  //unit

  getSupportedCryptoUnits(): string[] {
    return Object.keys(this.UNITS).slice(0, 3)
  }

  getSupportedCurrencies(): string[] {
    return Object.keys(this.UNITS).slice(3)
  }

  getPreferredCryptoUnit(): string {
    return this.stored.preference.cryptoUnit
  }

  async setPreferredCryptoUnit(sym: string): Promise<void> {
    this.stored.preference.cryptoUnit = sym
    this.events.publish('wallet:preferredcryptounit', sym)
    this.events.publish('wallet:preferredunit', this.getPreferredUnit())
    await this.updateStorage()
  }

  getPreferredCurrency(): string {
    return this.stored.preference.currency
  }

  async setPreferredCurrency(sym: string): Promise<void> {
    this.stored.preference.currency = sym
    this.events.publish('wallet:preferredcurrency', sym)
    this.events.publish('wallet:preferredunit', this.getPreferredUnit())
    await this.updateStorage()
  }

  getPreferredUnit(): string {
    return this.getUnits()[this.stored.preference.unitIndex]
  }

  async changePreferredUnit(): Promise<void> {
    let units: string[] = this.getUnits()
    this.stored.preference.unitIndex = (this.stored.preference.unitIndex + 1) % units.length
    let punit: string = units[this.stored.preference.unitIndex]
    this.events.publish('wallet:preferredunit', punit)
    await this.updateStorage()
  }

  getUnits(): string[] {
    return [
      this.stored.preference.cryptoUnit,
      this.stored.preference.currency
    ]
  }

  convertUnit(from: string, to: string, amountStr: string, comma?: boolean): string {
    let amount: number = parseFloat(amountStr)
    if (isNaN(amount)) {
      return undefined
    }
    // even if from === to
    let fromUnit: IUnit = this.UNITS[from]
    let toUnit: IUnit = this.UNITS[to]
    if (!(fromUnit && toUnit && fromUnit.rate && toUnit.rate)) {
      return undefined
    }
    let result: string = (amount / fromUnit.rate * toUnit.rate).toFixed(toUnit.dp)
    if (comma) {
      let p = result.split('.')
      p[0] = p[0].split('').reverse().join('').match(/\d{1,3}-?/g).join(',').split('').reverse().join('')
      result =  p.join('.')
    }
    return result
  }

  // address format

  getPreferredAddressFormat(): string {
    return this.stored.preference.addressFormat
  }

  async setPreferredAddressFormat(af: string): Promise<void> {
    if (af !== 'cashaddr' && af !== 'legacy') {
      return Promise.resolve()
    }
    this.stored.preference.addressFormat = af
    this.events.publish('wallet:preferredaddressformat', af)
    await this.updateStorage()
  }

  getAddressFormat(address: string): string {
    try {
      let format: string = bchaddr.detectAddressFormat(address)
      if (format === bchaddr.Format.Legacy) {
        return 'legacy'
      }
      if (format === bchaddr.Format.Cashaddr) {
        return 'cashaddr'
      }
    } catch (err) {

    }
    return undefined
  }

  convertAddress(from: string, to: string, address: string): string {
    from = from || this.getAddressFormat(address)
    if (!address || this.supportedAddressFormats.indexOf(from) === -1 || this.supportedAddressFormats.indexOf(to) === -1) {
      return undefined
    }
    if (from === 'cashaddr' && address.indexOf('bitcoincash:') !== 0) {
      address = 'bitcoincash:' + address
    }
    if (to === 'legacy') {
      return bchaddr.toLegacyAddress(address)
    }
    if (to === 'cashaddr') {
      return bchaddr.toCashAddress(address).slice(12)
    }
  }

  //storage

  async updateStorage(obj?: IStorage): Promise<IStorage> {
    let value: IStorage = obj || this.stored
    await this.storage.set(this.WALLET_KEY, value)
    return value
  }

  //wallet states

  changeState(s: EState): void {
    console.log('state: ' + s)
    this.state = s
    if (s === EState.CLOSED) {
      this.events.publish('wallet:closed')
    } else if (s === EState.OFFLINE) {
      this.events.publish('wallet:offline')
      this.events.publish('wallet:update')
    } else if (s === EState.SYNCED) {
      this.events.publish('wallet:synced')
      this.events.publish('wallet:update')
    }
  }

  isClosed(): boolean {
    return this.state === EState.CLOSED
  }

  isOffline(): boolean {
    return this.state === EState.OFFLINE
  }

  isConnecting(): boolean {
    return this.state === EState.CONNECTING
  }

  isOnline(): boolean {
    return this.state >= EState.CONNECTED
  }

  isConnected(): boolean {
    return this.state === EState.CONNECTED
  }

  isSyncing(): boolean {
    return this.state === EState.SYNCING
  }

  isSynced(): boolean {
    return this.state === EState.SYNCED
  }

  isWatchOnly(): boolean {
    return typeof this.currentWallet.keys.encMnemonic === 'undefined'
  }

  //wallet control

  closeWallet(): void {
    if (!this.isOffline() && !this.isClosed()) {
      this.socket.off('disconnect')
      this.socket.close()
      this.changeState(EState.CLOSED)
    }
  }

  async createStorage(): Promise<IStorage> {
    let obj: IStorage = {
      version: this.VERSION,
      wallets: [],
      preference: Object.assign({}, this.defaultPreference)
    }
    let value: IStorage = await this.updateStorage(obj)
    console.log('successfully created new storage')
    return value
  }

  nextWalletName(): string {
    let prefix: string = this.translate.instant('WALLET') + ' '
    let i: number
    if (this.stored && this.stored.wallets) {
      let names: string[] = this.getAllWalletNames()
      i = this.stored.wallets.length
      do {
        i++
      } while (names.indexOf(prefix + i) !== -1)
    } else {
      i = 1
    }
    return prefix + i
  }

  getCurrentWalletName(): string {
    return this.currentWallet.name
  }

  getAllWalletNames(): string[] {
    return this.stored.wallets.map(w => w.name)
  }

  async createWallet(mnemonicOrXprvOrXpub?: string, path?: string, passphrase?: string, name?: string, compliant?: boolean): Promise<void> {
    compliant = compliant === false ? false : true
    let encrypted: string
    let xpub: string
    let addresses: IAddresses
    if (mnemonicOrXprvOrXpub && mnemonicOrXprvOrXpub.match(/^xpub/g)) {
      encrypted = undefined
      xpub = mnemonicOrXprvOrXpub
      addresses = this.generateAddressesFromPublicKey(new bitcoincash.HDPublicKey(xpub))
    } else {
      let m: string = this.makeRecoveryString(mnemonicOrXprvOrXpub, path, passphrase)
      let hdPrivateKey: bitcoincash.HDPrivateKey = this.getHDPrivateKeyFromRecoveryString(m, compliant)
      let hdPublicKey: bitcoincash.HDPublicKey = hdPrivateKey.hdPublicKey
      encrypted = this._encryptText(m, this.DUMMY_KEY)
      xpub = hdPublicKey.toString()
      addresses = this.generateAddressesFromPrivateKey(hdPrivateKey)
    }

    let wallet: IWallet = {
      name: name || this.nextWalletName(),
      protection: 'off',
      keys: {
        encMnemonic: encrypted,
        compliant: compliant,
        xpub: xpub,
      },
      addresses: addresses,
      cache: {
        receiveAddress: addresses.receive[0],
        changeAddress: addresses.change[0],
        utxos: [],
        history: []
      }
    }
    // this.stored has to be ready
    this.stored.wallets.push(wallet)
    this.stored.preference.defaultWallet = wallet.name
    await this.updateStorage()
  }

  async recoverWalletFromMnemonicOrXprvOrXpub(mnemonicOrXprvOrXpub: string, path: string, passphrase: string, name: string, compliant: boolean): Promise<void> {
    this.closeWallet()
    await this.createWallet(mnemonicOrXprvOrXpub, path, passphrase, name, compliant)
    await this.startWallet()
  }

  async switchWallet(name: string): Promise<void> {
    if (!this.stored.wallets.find(w => w.name === name)) {
      throw new Error('no such wallet')
    }
    this.closeWallet()
    this.stored.preference.defaultWallet = name
    await this.updateStorage()
    await this.startWallet()
  }

  async renameWallet(oldName: string, newName: string): Promise<void> {
    let w: IWallet = this.stored.wallets.find(w => w.name === oldName)
    if (!w) {
      throw new Error('no such wallet')
    }
    w.name = newName
    if (this.stored.preference.defaultWallet === oldName) {
      this.stored.preference.defaultWallet = newName
    }
    await this.updateStorage()
  }

  async deleteWallet(name: string): Promise<void> {
    let i: number = this.stored.wallets.findIndex(w => w.name === name)
    if (i === -1) {
      throw new Error('no such wallet')
    }
    this.closeWallet()
    let names: string[] = this.getAllWalletNames().sort()
    let deleted: IWallet = this.stored.wallets.splice(i, 1)[0]
    let j: number = names.indexOf(deleted.name)
    let next: string = names[j + 1] || names[j - 1]
    if (next) {
      await this.switchWallet(next)
    } else {
      let loader: any = this.loadingCtrl.create()
      await loader.present()
      try {
        await this.updateStorage()
        await this.startWallet()
        await loader.dismiss()
      } catch (err) {
        await loader.dismiss()
        throw err
      }
    }
  }

  async startWallet(): Promise<void> {
    await this.loadWalletFromStorage()
    this.showAnnouncement()
    this.tryToConnectAndSync()
  }

  async loadWalletFromStorage(): Promise<void> {
    let value: any = await this.storage.get(this.WALLET_KEY)
    if (!value) {
      console.log('no stored object, will create a new one')
      this.stored = await this.createStorage()
    } else {
      console.log('stored object found')
      let willUpdate = false
      // if before 0.0.61, turn it to 0.0.61
      if (!value.hasOwnProperty('version')) {
        // before 0.0.61
        if (value.keys.hasOwnProperty('mnemonic') && !value.keys.hasOwnProperty('encMnemonic')) {
          let encrypted: string = this._encryptText(value.keys.mnemonic, this.DUMMY_KEY)
          delete value.keys.mnemonic
          value.keys.encMnemonic = encrypted
          willUpdate = true
        }
        if (value.preference.hasOwnProperty('pin')) {
          if (typeof value.preference.pin === 'undefined' || value.preference.pin === null) {
            value.preference.password = false
          } else {
            let decrypted: string = this._decryptText(value.keys.encMnemonic, this.DUMMY_KEY)
            let encrypted: string = this._encryptText(decrypted, value.preference.pin)
            value.keys.encMnemonic = encrypted
            value.preference.password = true
          }
          delete value.preference.pin
          willUpdate = true
        }
        if (value.preference.hasOwnProperty('pinHash')) {
          if (typeof value.preference.pinHash === 'undefined' || value.preference.pinHash === null) {
            value.preference.password = false
          } else {
            this.splashScreen.hide()
            let pw: string = await new Promise<string>((resolve, reject) => {
              let pinAlert = this.alertCtrl.create({
                enableBackdropDismiss: false,
                title: this.translate.instant('PIN'),
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
                        buttons: [this.translate.instant('OK')]
                      }).present()
                    }
                    return false
                  }
                }]
              })
              pinAlert.present()
            })
            let decrypted: string = this._decryptText(value.keys.encMnemonic, this.DUMMY_KEY)
            let encrypted: string = this._encryptText(decrypted, pw)
            value.keys.encMnemonic = encrypted
            value.preference.password = true
          }
          delete value.preference.pinHash
          willUpdate = true
        }
        if (value.preference.hasOwnProperty('chain')) {
          delete value.preference.chain
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
        // transition to 0.0.61
        value.wallets = [{
          name: this.translate.instant('WALLET') + ' 1',
          protection: value.preference.password ? 'password' : value.preference.fingerprint ? 'fingerprint' : 'off',
          keys: value.keys,
          addresses: value.addresses,
          cache: value.cache
        }]
        value.preference.defaultWallet = value.wallets[0].name
        delete value.keys
        delete value.addresses
        delete value.cache
        delete value.preference.password
        delete value.preference.fingerprint
        value.version = '0.0.61'
        willUpdate = true
      }
      let ver = value.version.split('.').map(v => parseInt(v))
      // pre 0.0.80 bip 32 compliance issues
      if (ver[0] === 0 && ver[1] === 0 && ver[2] < 80) {
        value.wallets.forEach((wallet: any) => {
          wallet.keys.compliant = false
        })
        willUpdate = true
      }
      // ensure no missing preferences
      Object.keys(this.defaultPreference).forEach((k) => {
        if (typeof value.preference[k] === 'undefined') {
          value.preference[k] = this.defaultPreference[k]
          willUpdate = true
        }
      })
      // upgrade version
      if (value.version !== this.VERSION) {
        value.version = this.VERSION
        willUpdate = true
      }
      if (willUpdate) {
        value = await this.updateStorage(value)
      }
      this.stored = value
    }
    // this.stored should be ready
    if (this.stored.wallets.length === 0) {
      console.log('no wallet, will create a new one')
      // push new wallet and set as default
      await this.createWallet()
    }
    this.currentWallet = this.stored.wallets.find(w => w.name === this.stored.preference.defaultWallet)
    if (!this.currentWallet) {
      // should not happen, but just in case
      this.currentWallet = this.stored.wallets[0]
      this.stored.preference.defaultWallet = this.currentWallet.name
      await this.updateStorage()
    }
    this.changeState(EState.OFFLINE)
    console.log('default wallet loaded')
  }

  async showAnnouncement(isInitiatedByUser?: boolean): Promise<void> {
    let ann: string
    try {
      let o: any = await this.http.get(this.ANNOUNCEMENT_URL).toPromise()
      let v: any = o[this.VERSION] || o['default']
      ann = v[(window as any).translationLanguage] || v['en']
    } catch (err) {
      console.log(err)
      if (isInitiatedByUser) {
        await this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('ERROR'),
          buttons: [this.translate.instant('OK')]
        }).present()
      }
      return
    }
    if (isInitiatedByUser) {
      if (!ann) {
        await this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('NO_ANNOUNCEMENT'),
          buttons: [this.translate.instant('OK')]
        }).present()
        return
      }
    } else if (!ann || this.stored.preference.lastAnnouncement === ann) {
      return
    }
    let buttons: any[] = []
    if (!isInitiatedByUser) {
      buttons.push({
        text: this.translate.instant('DO_NOT_SHOW_AGAIN'),
        handler: () => {
          this.stored.preference.lastAnnouncement = ann
          this.updateStorage()
        }
      })
    }
    buttons.push({
      text: this.translate.instant('OK')
    })
    let annAlert: any = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('ANNOUNCEMENT'),
      message: ann,
      buttons: buttons
    })
    if (isInitiatedByUser || this.app.getRootNav().getActive().component.pageName === 'HomePage' && !this.app._appRoot._overlayPortal.getActive()) {
      await annAlert.present()
    }
  }

  tryToConnectAndSync(): void {
    let socket: any = io(this.WS_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 1,
      timeout: 10000,
      transports: ['polling', 'websocket']
    })
    this.socket = socket
    socket.on('connect', async () => {
      try {
        let challenge: any = await this.apiWS('challengev2', {
          version: this.VERSION
        }, true)
        let challengeBuffer: Buffer = Buffer.from(challenge.nonce, 'hex')
        let response: Buffer = Buffer.alloc(4)
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
            if (socket !== this.socket) {
              throw new Error('obsolete')
            }
          }
        }
        await this.apiWS('startwallet', {
          response: response.toString('hex'),
          xpub: this.currentWallet.keys.xpub
        }, true)
        if (socket !== this.socket) {
          throw new Error('obsolete')
        }
        this.changeState(EState.CONNECTED)
        await Promise.all([
          this.apiWS('price.subscribe').then((price) => { this.updatePrice(price) }),
          this.apiWS('address.subscribe'),
          this.syncEverything(true)
        ])
      } catch (err) {
        console.log(err)
        socket.close()
        if (socket !== this.socket) {
          return
        }
        this.changeState(EState.OFFLINE)
        if (err.message === 'update') {
          this.showUpdateAlert()
        }
      }
    })
    let timer: number
    socket.on('notification', (data) => {
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
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' || this.isPaused) {
        socket.close()
        if (socket !== this.socket) {
          return
        }
        this.changeState(EState.OFFLINE)
      }
    })
    socket.on('reconnect_attempt', (n: number) => {
      if (socket !== this.socket) {
        return
      }
      this.changeState(EState.CONNECTING)
    })
    socket.on('reconnect_failed', () => {
      socket.close()
      if (socket !== this.socket) {
        return
      }
      this.changeState(EState.OFFLINE)
    })

    this.changeState(EState.CONNECTING)
    socket.open()
  }

  async syncEverything(fullSync?: boolean): Promise<void> {
    let currentWallet: IWallet = this.currentWallet
    this.changeState(EState.SYNCING)

    let syncTaskId: number = this.syncTaskId++
    let targetAddresses: string[] = fullSync ? undefined : this.pendingAddresses.slice()
    let minHeight: number = 0
    try {
      minHeight = Math.max(0, currentWallet.cache.history.find(h => h.height > 0).height - 200)
    } catch (err) {
      console.log(err)
    }
    this.pendingAddresses.length = 0
    let results: any[] = await Promise.all([
      this.apiWS('finaladdresspair').then(result => this.syncAddresses(currentWallet, result)),
      this.apiWS('unusedreceiveaddress'),
      this.apiWS('unusedchangeaddress'),
      this.apiWS('utxos', { addresses: targetAddresses }),
      this.apiWS('history', { addresses: targetAddresses, minHeight: minHeight })
    ])

    if (currentWallet !== this.currentWallet || syncTaskId !== this.syncTaskId - 1) {
      return
    }

    if (!this.isMyReceiveAddress(results[1]) || !this.isMyChangeAddress(results[2])) {
      throw new Error('invalid address')
    }

    // identify new txs
    let allTxids: string[] = this.getAllTxids()
    let newTxs: ITxRecord[] = results[4].filter(tx => allTxids.indexOf(tx.txid) === -1)
    let oldTxs: ITxRecord[] = results[4].filter(tx => allTxids.indexOf(tx.txid) !== -1)
    let newTxids: string[] = newTxs.map(tx => tx.txid)

    let skipNotification: boolean = (allTxids.length === 0 && results[4].length > 1) || this.app.getRootNav().getActive().component.pageName === 'HistoryPage'
    if (!skipNotification) {
      let _newTxs: ITxRecord[] = newTxs
      let lastConfirmed: ITxRecord = currentWallet.cache.history.find(tx => typeof tx.timestamp !== 'undefined')
      if (typeof lastConfirmed !== 'undefined') {
        _newTxs = _newTxs.filter(tx => typeof tx.timestamp === 'undefined' || tx.timestamp >= lastConfirmed.timestamp)
      }
      let unit: string = this.getPreferredUnit()
      let isCordova: boolean = this.platform.is('cordova')
      _newTxs.forEach((tx) => {
        if (tx.delta <= 0) {
          return
        }
        let receivedAmount: string = this.convertUnit('SATS', unit, tx.delta.toString(), true) || ''
        if (receivedAmount.match(/^\d+\.\d+$/g)) {
          receivedAmount = receivedAmount.replace(/\.?0+$/, '')
        }
        let msg: string = `${this.translate.instant('RECEIVED')} ${receivedAmount} ${unit}`
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

    // update history
    let currentHistory: ITxRecord[] = currentWallet.cache.history
    let unseenTxids: string[] = this.getUnseenTxids().concat(newTxids)
    let currentTimestamp: number = Math.floor(new Date().getTime() / 1000)
    oldTxs.forEach((otx) => {
      let tx: ITxRecord = currentHistory.find(tx => tx.txid === otx.txid)
      let newValue: ITxRecord = {
        txid: otx.txid,
        height: otx.height,
        timestamp: otx.timestamp,
        friendlyTimestamp: tx.friendlyTimestamp || (otx.timestamp ? Math.min(otx.timestamp, currentTimestamp) : currentTimestamp),
        delta: otx.delta,
        seen: unseenTxids.indexOf(otx.txid) === -1
      }
      Object.assign(tx, newValue)
    })
    currentHistory.splice.apply(currentHistory, ([0, 0] as any[]).concat(newTxs.map(ntx => {
      return {
        txid: ntx.txid,
        height: ntx.height,
        timestamp: ntx.timestamp,
        friendlyTimestamp: ntx.timestamp ? Math.min(ntx.timestamp, currentTimestamp) : currentTimestamp,
        delta: ntx.delta,
        seen: false
      }
    })))
    currentHistory.forEach((h, i) => {
      (h as any).tempIndex = i
    })
    currentHistory.sort((a, b) => {
      // descending friendlyTimestamp
      let v = b.friendlyTimestamp - a.friendlyTimestamp
      if (v !== 0) {
        return v
      }
      // ascending tempIndex
      return (a as any).tempIndex - (b as any).tempIndex
    })
    currentHistory.forEach((h) => {
      delete (h as any).tempIndex
    })

    // new utxos
    let newUtxos: IUtxo[]
    if (fullSync) {
      newUtxos = results[3].map((obj: IUtxo) => {
        return {
          txid: obj.txid,
          vout: obj.vout,
          address: obj.address,
          //path relies on up-to-date this.currentWallet.addresses
          path: this.getAddressTypeAndIndex(obj.address),
          scriptPubKey: obj.scriptPubKey,
          satoshis: obj.satoshis
        }
      }).filter(utxo => typeof utxo.path !== 'undefined')
    } else {
      let futxos: IUtxo[] = results[3].filter((nutxo) => {
        return this.currentWallet.cache.utxos.findIndex(outxo => outxo.txid === nutxo.txid && outxo.vout === nutxo.vout) === -1
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
      let rutxos: IUtxo[] = this.currentWallet.cache.utxos.filter(outxo => targetAddresses.indexOf(outxo.address) === -1 || results[3].findIndex(nutxo => outxo.txid === nutxo.txid && outxo.vout === nutxo.vout) !== -1)
      newUtxos = rutxos.concat(futxos)
    }

    //update cache
    this.currentWallet.cache = {
      receiveAddress: results[1],
      changeAddress: results[2],
      utxos: newUtxos,
      history: currentHistory
    }
    await this.updateStorage()
    if (!this.isSyncing() || currentWallet !== this.currentWallet || syncTaskId !== this.syncTaskId - 1) {
      return
    }
    if (this.pendingAddresses.length > 0) {
      return await this.syncEverything()
    }
    this.changeState(EState.SYNCED)
  }

  async syncAddresses(currentWallet: IWallet, pair: { receive: number, change: number }): Promise<IAddresses> {
    let newAddresses: IAddresses = { receive: [], change: [] }

    currentWallet.addresses.receive.length = Math.min(pair.receive + 1, currentWallet.addresses.receive.length)
    currentWallet.addresses.change.length = Math.min(pair.change + 1, currentWallet.addresses.change.length)

    if (pair.receive === currentWallet.addresses.receive.length - 1 && pair.change === currentWallet.addresses.change.length - 1) {
      return newAddresses
    }
    let hdPublicKey: bitcoincash.HDPublicKey = this.getHDPublicKey(currentWallet)
    let d: bitcoincash.HDPublicKey[] = [hdPublicKey.deriveChild(0), hdPublicKey.deriveChild(1)]
    // let hdPrivateKey: bitcoincash.HDPrivateKey = this.getHDPrivateKeyFromRecoveryString(this.getRecoveryString())
    // let d: bitcoincash.HDPrivateKey[] = [hdPrivateKey.deriveChild(0), hdPrivateKey.deriveChild(1)]
    for (let i: number = currentWallet.addresses.receive.length; i <= pair.receive; i++) {
      await this.delay(0)
      newAddresses.receive.push(d[0].deriveChild(i).publicKey.toAddress().toString())
    }
    for (let i: number = currentWallet.addresses.change.length; i <= pair.change; i++) {
      await this.delay(0)
      newAddresses.change.push(d[1].deriveChild(i).publicKey.toAddress().toString())
    }
    Array.prototype.push.apply(currentWallet.addresses.receive, newAddresses.receive)
    Array.prototype.push.apply(currentWallet.addresses.change, newAddresses.change)
    return newAddresses
  }

  updatePrice(price: { [key: string]: number }): void {
    for (let k in price) {
      if (this.UNITS[k]) {
        this.UNITS[k].rate = price[k]
      } else {
        this.UNITS[k] = { rate: price[k], dp: 2 }
      }
    }
    this.events.publish('wallet:price')
  }

  //event subscription

  subscribeUpdate(callback: Function): void {
    if (this.state >= EState.OFFLINE) {
      callback()
    }
    this.events.subscribe('wallet:update', callback)
    console.log('subscribeUpdate')
  }

  unsubscribeUpdate(callback: Function): void {
    this.events.unsubscribe('wallet:update', callback)
    console.log('unsubscribeUpdate')
  }

  subscribePrice(callback: Function): void {
    this.events.subscribe('wallet:price', callback)
    console.log('subscribePrice')
  }

  unsubscribePrice(callback: Function): void {
    this.events.unsubscribe('wallet:price', callback)
    console.log('unsubscribePrice')
  }

  subscribePreferredUnit(callback: Function): void {
    this.events.subscribe('wallet:preferredunit', callback)
    console.log('subscribePreferredUnit')
  }

  unsubscribePreferredUnit(callback: Function): void {
    this.events.unsubscribe('wallet:preferredunit', callback)
    console.log('unsubscribePreferredUnit')
  }

  //helper

  delay(ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      window.setTimeout(() => {
        resolve()
      }, ms)
    })
  }

  createMnemonic(): string {
    return new bitcoincash_Mnemonic(crypto.randomBytes(16)).phrase
  }

  generateAddressesFromPrivateKey(hdPrivateKey: bitcoincash.HDPrivateKey): IAddresses {
    let d: bitcoincash.HDPrivateKey[] = [hdPrivateKey.deriveChild(0), hdPrivateKey.deriveChild(1)]
    let addresses: IAddresses = { receive: [], change: [] }
    for (let i: number = 0; i < 20; i++) {
      addresses.receive[i] = d[0].deriveChild(i).privateKey.toAddress().toString()
      addresses.change[i] = d[1].deriveChild(i).privateKey.toAddress().toString()
    }
    return addresses
  }

  generateAddressesFromPublicKey(hdPublicKey: bitcoincash.HDPublicKey): IAddresses {
    let d: bitcoincash.HDPublicKey[] = [hdPublicKey.deriveChild(0), hdPublicKey.deriveChild(1)]
    let addresses: IAddresses = { receive: [], change: [] }
    for (let i: number = 0; i < 20; i++) {
      addresses.receive[i] = d[0].deriveChild(i).publicKey.toAddress().toString()
      addresses.change[i] = d[1].deriveChild(i).publicKey.toAddress().toString()
    }
    return addresses
  }

  getHDPrivateKeyFromRecoveryString(m: string, compliant?: boolean): bitcoincash.HDPrivateKey {
    let o: IRecoveryInfo = this.parseRecoveryString(m)
    if (o.xprv) {
      return new bitcoincash.HDPrivateKey(o.xprv)
    }
    compliant = typeof compliant === 'boolean' ? compliant : this.isBIP32Compliant()
    if (compliant) {
      console.log('derive compliant')
      return new bitcoincash_Mnemonic(o.mnemonic).toHDPrivateKey(o.passphrase).deriveChild(o.path)
    } else {
      console.log('derive non-compliant')
      return new bitcoincash_Mnemonic(o.mnemonic).toHDPrivateKey(o.passphrase).deriveNonCompliantChild(o.path)
    }
  }

  makeRecoveryString(mnemonicOrXprv?: string, path?: string, passphrase?: string): string {
    if (mnemonicOrXprv && mnemonicOrXprv.match(/^xprv[\d\w]+$/g)) {
      return mnemonicOrXprv
    }
    mnemonicOrXprv = mnemonicOrXprv || this.createMnemonic()
    path = path || "m/44'/145'/0'"
    passphrase = passphrase || ''
    return mnemonicOrXprv + ':' + path + ':' + passphrase
  }

  parseRecoveryString(m: string): IRecoveryInfo {
    if (m.match(/^xprv[\d\w]+$/g)) {
      return {
        xprv: m
      }
    }
    let a: string[] = m.split(':')
    return {
      mnemonic: a[0],
      path: a[1] || "m/44'/145'/0'", // default path before version 0.0.60
      passphrase: a.slice(2).join(':') || undefined
    }
  }

  formatMnemonic(s: string): string {
    s = s.trim()
    s = s.replace(/\s+/g, ' ')
    if (s.indexOf(' ') === -1) {
      s = s.split('').join(' ')
    }
    s = s.toLowerCase()
    return s
  }

  validateMnemonic(m: string): boolean {
    try {
      return bitcoincash_Mnemonic.isValid(m)
    } catch (err) {
      return false
    }
  }

  validateXprv(xprv: string): boolean {
    if (!xprv) {
      return false
    }
    try {
      new bitcoincash.HDPrivateKey(xprv)
      return true
    } catch (err) {
      return false
    }
  }

  validateXpub(xpub: string): boolean {
    try {
      new bitcoincash.HDPublicKey(xpub)
      return true
    } catch (err) {
      return false
    }
  }

  validateWIF(wif: string): boolean {
    // rule out hex string
    if (wif.toLowerCase().match(/^[a-f0-9]+$/g)) {
      return false
    }
    try {
      new bitcoincash.PrivateKey(wif)
      return true
    } catch (err) {
      return false
    }
  }

  validateEncryptedWIF(wif: string): boolean {
    if (!wif.match(/^6P[1-9A-NP-Za-km-z]{56}$/g)) {
      return false
    }
    try {
      bs58check.decode(wif)
      return true
    } catch (err) {
      return false
    }
  }

  isMyReceiveAddress(address: string): boolean {
    return typeof this.getAddressTypeAndIndex(address, 0) !== 'undefined'
  }

  isMyChangeAddress(address: string): boolean {
    return typeof this.getAddressTypeAndIndex(address, 1) !== 'undefined'
  }

  scriptFromAddress(address: string): string {
    try {
      let a: bitcoincash.Address = new bitcoincash.Address(address)
      if (a.isPayToPublicKeyHash()) {
        return bitcoincash.Script.buildPublicKeyHashOut(a).toHex()
      } else if (a.isPayToScriptHash()) {
        return bitcoincash.Script.buildScriptHashOut(a).toHex()
      } else {
        throw new Error('invalid address')
      }
    } catch (err) {
      console.log(err)
      throw new Error('invalid address')
    }
  }

  getAddressTypeAndIndex(address: string, type?: number): [number, number] {
    let ra: string[] = this.currentWallet.addresses.receive
    let ca: string[] = this.currentWallet.addresses.change
    let lenr: number = typeof type === 'undefined' || type === 0 ? ra.length : 0
    let lenc: number = typeof type === 'undefined' || type === 1 ? ca.length : 0
    let len: number = Math.min(lenr, lenc)
    for (let i: number = 1; i <= len; i++) {
      if (address === ra[lenr - i]) {
        return [0, lenr - i]
      } else if (address === ca[lenc - i]) {
        return [1, lenc - i]
      }
    }
    if (lenr > len) {
      for (let i: number = lenr - len - 1; i >= 0; i--) {
        if (address === ra[i]) {
          return [0, i]
        }
      }
    } else if (lenc > len) {
      for (let i: number = lenc - len - 1; i >= 0; i--) {
        if (address === ca[i]) {
          return [1, i]
        }
      }
    } else {
      return undefined
    }
  }

  getAllTxids(): string[] {
    return this.currentWallet.cache.history.map(obj => obj.txid)
  }

  getUnseenTxids(): string[] {
    return this.currentWallet.cache.history.filter(obj => !obj.seen).map(obj => obj.txid)
  }

  async seeTheUnseen(): Promise<void> {
    let touch: boolean = false
    this.currentWallet.cache.history.forEach((obj) => {
      if (!touch && !obj.seen) {
        touch = true
      }
      obj.seen = true
    })
    if (touch) {
      await this.updateStorage()
    }
  }

  //getters

  getHDPublicKey(currentWallet?: IWallet): bitcoincash.HDPublicKey {
    currentWallet = currentWallet || this.currentWallet
    return new bitcoincash.HDPublicKey(currentWallet.keys.xpub)
  }

  getXpub(): string {
    return this.currentWallet.keys.xpub
  }

  getRecoveryString(password?: string): string {
    let decrypted: string = this._decryptText(this.currentWallet.keys.encMnemonic, password || this.DUMMY_KEY)
    let o: IRecoveryInfo = this.parseRecoveryString(decrypted)
    if (o.mnemonic && this.validateMnemonic(o.mnemonic) || o.xprv && this.validateXprv(o.xprv)) {
      return decrypted
    } else {
      throw new Error('invalid password')
    }
  }

  isBIP32Compliant(): boolean {
    return this.currentWallet.keys.compliant
  }

  _encryptText(text: string, password: string): string {
    let cipher: any = crypto.createCipher('aes192', password)
    let encrypted: string = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return encrypted
  }

  _decryptText(cipherText: string, password: string): string {
    let decipher: any = crypto.createDecipher('aes192', password)
    let decrypted: string = decipher.update(cipherText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  getPaymentRequestURL(address: string, sat?: number): string {
    let af: string = this.getAddressFormat(address)
    if (!af) {
      throw new Error('invalid address')
    }
    if (sat > 0) {
      return 'bitcoin:' + address + '?sv&amount=' + this.convertUnit('SATS', 'BSV', sat.toString()).replace(/\.?0+$/, '')
    } else {
      return address
    }
  }

  getQR(text: string): Promise<string> {
    return QRCode.toDataURL(text, { margin: 1, errorCorrectionLevel: 'L' })
  }

  getQRs(text: string, prefix: string): Promise<string[]> {
    let segLength: number = Math.ceil(text.length / Math.ceil(text.length / 2500))
    let regex: RegExp = new RegExp('.{1,' + segLength + '}', 'gi')
    let segments: string[] = text.match(regex)
    let last: number = segments.length - 1
    let qrStrings: string[] = segments.map((s, i) => [prefix, i, last, s].join(' '))
    return Promise.all(qrStrings.map(q => this.getQR(q)))
  }

  getRequestFromURL(text: string): IRequest {
    let params: any = {}
    let address: string
    let satoshis: number
    let url: string
    let label: string
    let message: string

    if (text.match(/^bitcoin:/gi)) {
      text = text.slice(8)
    } else if (text.match(/^bitcoincash:/gi)) {
      text = text.slice(12)
    } else if (text.match(/^bitcoin[-_]cash:/gi)) {
      text = text.slice(13)
    } else if (text.match(/^bitcoinsv:/gi)) {
      text = text.slice(10)
    } else if (text.match(/^bitcoin[-_]sv:/gi)) {
      text = text.slice(11)
    } else {
      return
    }

    let addr: string
    let i: number = text.indexOf('?')
    if (i === -1) {
      addr = text
    } else {
      addr = text.slice(0, i)
    }
    if (typeof this.getAddressFormat(addr) !== 'undefined') {
      address = addr
    }
    if (typeof address === 'undefined' && i === -1) {
      return
    }

    let kvs: string[] = text.slice(i + 1).split('&')
    let j: number = kvs.findIndex((kv: string) => {
      return kv.match(/^req-.*$/gi) && !kv.match(/^req-sv(=.*)?$/gi)
    })
    if (j !== -1) {
      return
    }

    kvs.forEach((kv) => {
      let s: string[] = kv.split('=')
      params[s[0]] = s.slice(1).join('=')
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

  async getInfoFromWIF(wif: string): Promise<IWifInfo> {
    let sk: bitcoincash.PrivateKey = new bitcoincash.PrivateKey(wif)
    let address: string = sk.toAddress().toString()
    let result: any = await this.apiWS('utxos', { address: address })
    let utxos: IUtxo[] = result.map((obj: IUtxo) => {
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
  }

  getReceiveAddressCount(): number {
    return this.currentWallet.addresses.receive.length
  }

  getChangeAddressCount(): number {
    return this.currentWallet.addresses.change.length
  }

  getAllReceiveAddresses(): string[] {
    return this.currentWallet.addresses.receive.slice()
  }

  getAllChangeAddresses(): string[] {
    return this.currentWallet.addresses.change.slice()
  }

  getCacheReceiveAddress(): string {
    return this.currentWallet.cache.receiveAddress
  }

  getCacheChangeAddress(): string {
    return this.currentWallet.cache.changeAddress
  }

  getCacheBalance(): number {
    let balance: number = 0
    this.currentWallet.cache.utxos.forEach((utxo: IUtxo) => {
      balance += utxo.satoshis
    })
    return balance
  }

  getCacheHistory(): ITxRecord[] {
    return this.currentWallet.cache.history.slice()
  }

  getCacheUtxos(): IUtxo[] {
    return this.currentWallet.cache.utxos.slice()
  }

  getPrivateKeys(paths: [number, number][], m: string): bitcoincash.PrivateKey[] {
    let _paths: [number, number][] = []
    paths.forEach((p) => {
      let i: number = _paths.findIndex(_p => _p[0] === p[0] && _p[1] === p[1])
      if (i === -1) {
        _paths.push(p)
      }
    })
    let hdPrivateKey: bitcoincash.HDPrivateKey = this.getHDPrivateKeyFromRecoveryString(m)
    let d: bitcoincash.HDPrivateKey[] = [hdPrivateKey.deriveChild(0), hdPrivateKey.deriveChild(1)]
    return _paths.map(p => d[p[0]].deriveChild(p[1]).privateKey)
  }

  getWIF(path: [number, number], m: string): string {
    return this.getPrivateKeys([path], m)[0].toWIF()
  }

  getXprv(m: string): string {
    return this.getHDPrivateKeyFromRecoveryString(m).toString()
  }

  //tx

  async makeSignedTx(outputs: IOutput[], drain: boolean, m: string): Promise<ITransaction> {
    let au: IUtxo[] = this.getCacheUtxos()
    let ak: bitcoincash.PrivateKey[] = this.getPrivateKeys(au.map(u => u.path), m)
    return await this._makeTx(outputs, drain, au, ak)
  }

  async makeUnsignedTx(outputs: IOutput[], drain: boolean): Promise<ITransaction> {
    let au: IUtxo[] = this.getCacheUtxos()
    return await this._makeTx(outputs, drain, au, [])
  }

  async _makeTx(outputs: IOutput[], drain: boolean, availableUtxos: IUtxo[], availableKeys: bitcoincash.PrivateKey[]): Promise<ITransaction> {
    let satoshis: number = drain ? undefined : outputs.map(output => output.satoshis).reduce((acc, curr) => acc + curr)
    if (availableUtxos.length === 0) {
      throw new Error('not enough fund')
    }
    let availableAmount: number = drain ? availableUtxos.map((curr) => curr.satoshis).reduce((acc, curr) => acc + curr) : 0

    let agedAmount: number = 0
    let agedUtxos: IUtxo[] = []
    let recentUtxos: IUtxo[] = []
    if (!drain) {
      let limits: number[] = [
        Math.max(0, this.getReceiveAddressCount() - 20 - 20),
        Math.max(0, this.getChangeAddressCount() - 20 - 20)
      ]
      availableUtxos.forEach((u) => {
        if (u.path[1] < limits[u.path[0]] && agedUtxos.length < 10) {
          agedUtxos.push(u)
          agedAmount += u.satoshis
        } else {
          recentUtxos.push(u)
        }
      })
    }

    let acc: number
    let utxos: IUtxo[]
    let toAmount: number
    let changeAmount: number
    let changeOutputScript: string = this.scriptFromAddress(this.currentWallet.cache.changeAddress)
    let changeOutputIndex: number = Math.floor(Math.random() * (outputs.length + 1))
    let _outputs: IOutput[]
    let hex_tentative: string
    let fee_tentative: number = 0
    let fee_required: number

    while (true) {
      if (drain) {
        acc = availableAmount
        utxos = availableUtxos
        toAmount = acc - fee_tentative
        if (toAmount < 546) {
          throw new Error('not enough fund')
        }
        changeAmount = 0
        _outputs = [{
          script: outputs[0].script,
          satoshis: toAmount
        }]
      } else {
        let i: number = 0
        acc = agedAmount
        utxos = agedUtxos.slice()
        while (true) {
          let excess: number = acc - satoshis - fee_tentative
          if (excess >= 0 && excess <= 34 || excess >= 546 || i >= recentUtxos.length) {
            break
          }
          let utxo: IUtxo = recentUtxos[i]
          acc += utxo.satoshis
          utxos.push(utxo)
          i++
        }
        toAmount = satoshis
        if (acc < toAmount + fee_tentative) {
          throw new Error('not enough fund')
        }
        changeAmount = acc - toAmount - fee_tentative
        _outputs = outputs.slice()
        if (changeAmount < 546) {
          changeAmount = 0
        } else {
          _outputs.splice(changeOutputIndex, 0, {
            script: changeOutputScript,
            satoshis: changeAmount
          })
        }
      }
      if (availableKeys.length > 0) {
        let ustx: bitcoincash.Transaction = new bitcoincash.Transaction()
          .from(utxos.map(utxo => new bitcoincash.Transaction.UnspentOutput(utxo)))
        _outputs.forEach((o) => {
          ustx.addOutput(new bitcoincash.Transaction.Output(o))
        })
        hex_tentative = await this.signTx(ustx, availableKeys)
        fee_required = hex_tentative.length / 2
      } else {
        fee_required = 149 * utxos.length + 34 * _outputs.length + 10
      }
      if (fee_tentative >= fee_required) {
        break
      } else {
        fee_tentative = fee_required
      }
    }

    let txOutputs: IOutput[] = _outputs
    let changeOutput: IOutput = txOutputs.find(o => o.script === changeOutputScript)
    if (changeOutput) {
      changeOutput.path = this.getAddressTypeAndIndex(this.currentWallet.cache.changeAddress, 1)
    }

    let txInputs: IInput[] = utxos.map(u => {
      return {
        txid: u.txid,
        vout: u.vout,
        path: u.path,
        script: u.scriptPubKey,
        satoshis: u.satoshis
      }
    })

    return {
      satoshis: toAmount,
      fee: acc - toAmount - changeAmount,
      hex: hex_tentative,
      inputs: txInputs,
      outputs: txOutputs
    }
  }

  async makeSweepTx(wif: string, info?: IWifInfo): Promise<ITransaction> {
    let keys: bitcoincash.PrivateKey[] = [new bitcoincash.PrivateKey(wif)]
    if (!info) {
      info = await this.getInfoFromWIF(wif)
    }
    let output: IOutput = {
      script: this.scriptFromAddress(this.currentWallet.cache.receiveAddress),
      satoshis: 0
    }
    return await this._makeTx([output], true, info.utxos, keys)
  }

  async signTx(ustx: bitcoincash.Transaction, keys: bitcoincash.PrivateKey[]): Promise<string> {
    if (!ustx.hasAllUtxoInfo()) {
      throw new Error('invalid utxo')
    }
    let n: number = 0
    for (let privKey of keys) {
      privKey = new bitcoincash.PrivateKey(privKey)
      let sigtype = bitcoincash.crypto.Signature.SIGHASH_ALL | bitcoincash.crypto.Signature.SIGHASH_FORKID
      let transaction = ustx
      let hashData = bitcoincash.crypto.Hash.sha256ripemd160(privKey.publicKey.toBuffer())
      for (let index = 0; index < transaction.inputs.length; index++) {
        let sigs = transaction.inputs[index].getSignatures(transaction, privKey, index, sigtype, hashData)
        for (let signature of sigs) {
          transaction.applySignature(signature)
          if (n === 9) {
            n = 0
            await this.delay(0)
          } else {
            n++
          }
        }
      }
    }
    return ustx.serialize({
      disableDustOutputs: true,
      disableSmallFees: true
    })
  }

  async signPreparedTx(tx: ITransaction, m: string): Promise<ITransaction> {
    let ustx: bitcoincash.Transaction = new bitcoincash.Transaction()
      .from(tx.inputs.map(utxo => new bitcoincash.Transaction.UnspentOutput(utxo)))
    tx.outputs.forEach((output) => {
      ustx.addOutput(new bitcoincash.Transaction.Output(output))
    })
    let ak: bitcoincash.PrivateKey[] = this.getPrivateKeys(tx.inputs.map(u => u.path), m)
    tx.hex = await this.signTx(ustx, ak)
    return tx
  }

  validatePreparedTx(tx: ITransaction): void {
    let toAmount: number = 0
    let hdPublicKey: bitcoincash.HDPublicKey = this.getHDPublicKey()
    let d: bitcoincash.HDPublicKey[] = [hdPublicKey.deriveChild(0), hdPublicKey.deriveChild(1)]
    tx.inputs.forEach(i => {
      let address: string = d[i.path[0]].deriveChild(i.path[1]).publicKey.toAddress().toString()
      if (this.scriptFromAddress(address) !== i.script) {
        throw new Error('invalid')
      }
    })
    tx.outputs.forEach(o => {
      if (o.path) {
        let address: string = d[o.path[0]].deriveChild(o.path[1]).publicKey.toAddress().toString()
        if (this.scriptFromAddress(address) !== o.script) {
          throw new Error('invalid')
        }
      } else {
        toAmount += o.satoshis
      }
    })
    if (tx.satoshis !== toAmount) {
      throw new Error('invalid')
    }
  }

  getRecipientsFromTx(tx: ITransaction): string[] {
    return tx.outputs.filter(o => typeof o.path === 'undefined').map(o => {
      let a: bitcoincash.Address = (new bitcoincash.Script(o.script)).toAddress()
      return a ? a.toString() : 'unknown'
    })
  }

  async _broadcastTx(signedTx: string): Promise<string> {
    let txid: any = await this.apiWS('broadcast', { tx: signedTx })
    return txid
  }

  async broadcastTx(hex: string, loader?: any): Promise<boolean> {
    if (!loader) {
      loader = this.loadingCtrl.create({
        content: this.translate.instant('BROADCASTING')+'...'
      })
      await loader.present()
    } else {
      loader.setContent(this.translate.instant('BROADCASTING')+'...')
    }
    try {
      await this._broadcastTx(hex)
      await loader.dismiss()
      let successAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('TX_COMPLETE'),
        buttons: [this.translate.instant('OK')]
      })
      await successAlert.present()
      return true
    } catch (err) {
      await loader.dismiss()
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = this.translate.instant('ERR_NOT_CONNECTED')
      } else if (err.message == 'timeout') {
        message = this.translate.instant('ERR_TIMEOUT')
      } else {
        message = this.translate.instant('ERR_INVALID_TX')
      }
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: message,
        buttons: [this.translate.instant('OK')]
      }).present()
      return false
    }
  }

  // BIP70

  getCommonNameFromCert(cert: Uint8Array): string {
    let certificate: jsrsasign.X509 = new jsrsasign.X509()
    certificate.readCertHex(Buffer.from(cert).toString('hex'))
    let cn = certificate.getSubjectString().split(/\s*[^\\]?\/\s*/).find(s => {
      return s.match(/^CN=/gi)
    })
    if (typeof cn !== 'undefined') {
      return cn.slice(3).trim()
    }
  }

  verifySignature(dataHash: Uint8Array, cert: Uint8Array, signature: Uint8Array): boolean {
    return jsrsasign.X509.getPublicKeyFromCertHex(Buffer.from(cert).toString('hex')).verifyWithMessageHash(Buffer.from(dataHash).toString('hex'), Buffer.from(signature).toString('hex'))
  }

  async verifyCertificateChain(chainData: Uint8Array[]): Promise<boolean> {
    // trusted
    let trustedCertificates: string[] = (await this.http.get('assets/cacerts.txt', {
      responseType: 'text'
    }).toPromise() as string).trim().split(/\r?\n/g).map((s: string) => {
      return Buffer.from(s, 'base64').toString('hex')
    })
    // chain
    let certificates: string[] = chainData.map((b: Uint8Array) => {
      return Buffer.from(b).toString('hex')
    })
    // chain validation
    for (let i = 0; i < certificates.length; i++) {
      // cert
      let certificateHex: string = certificates[i]
      let certificate: jsrsasign.X509 = new jsrsasign.X509()
      certificate.readCertHex(certificateHex)
      // check time
      let now: number = new Date().getTime()
      let notBefore: number = convertToTime(certificate.getNotBefore())
      let notAfter: number = convertToTime(certificate.getNotAfter())
      if (now < notBefore || now > notAfter) {
        return false
      }
      // ca
      let caCertificateHex: string
      if (i + 1 < certificates.length) {
        caCertificateHex = certificates[i + 1]
      } else {
        let issuerHex: string = certificate.getIssuerHex()
        caCertificateHex = trustedCertificates.find(hex => {
          let tc: jsrsasign.X509 = new jsrsasign.X509()
          tc.readCertHex(hex)
          return tc.getSubjectHex() === issuerHex
        })
        if (typeof caCertificateHex === 'undefined') {
          return false
        }
      }
      // Verify against CA
      let certStruct = jsrsasign.ASN1HEX.getTLVbyList(certificate.hex, 0, [0])
      let algorithm = certificate.getSignatureAlgorithmField()
      let signatureHex = certificate.getSignatureValueHex()
      let signature = new jsrsasign.crypto.Signature({ alg: algorithm })
      signature.init('-----BEGIN CERTIFICATE-----\r\n' + Buffer.from(caCertificateHex, 'hex').toString('base64').match(/.{1,64}/g).join('\r\n') + '\r\n-----END CERTIFICATE-----')
      signature.updateHex(certStruct)
      if (!signature.verify(signatureHex)) {
        return false
      }
    }
    return true

    function convertToTime(s: string): number {
      if (s.length === 13) {
        let yy = parseInt(s.slice(0, 2))
        if (yy >= 50) {
          s = '19' + s
        } else {
          s = '20' + s
        }
      } else if (s.length !== 15) {
        throw new Error('invalid time string')
      }
      let arr = s.match(/\d\d/g)
      let t = new Date(
        parseInt(arr[0] + arr[1]),
        parseInt(arr[2]) - 1,
        parseInt(arr[3]),
        parseInt(arr[4]),
        parseInt(arr[5]),
        parseInt(arr[6]),
        0
      ).getTime()
      if (isNaN(t)) {
        throw new Error('invalid time string')
      }
      return t
    }
  }

  async getRequestFromMerchant(url: string): Promise<IBIP70Request> {
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

    // validate
    let cname: string
    let verified: boolean = false
    if (paymentRequest.pkiType !== 'none') {
      try {
        if (paymentRequest.pkiType !== 'x509+sha256' && paymentRequest.pkiType !== 'x509+sha1') {
          throw new Error('unsupported pki')
        }
        let X509Certificates: any = root.lookupType("payments.X509Certificates")
        let chainData: Uint8Array[] = X509Certificates.decode(paymentRequest.pkiData).certificate
        let signature: Uint8Array = paymentRequest.signature
        paymentRequest.signature = new Uint8Array(0)
        let dataHash: Uint8Array = crypto.createHash(paymentRequest.pkiType.split('+')[1]).update(PaymentRequest.encode(paymentRequest).finish()).digest()
        paymentRequest.signature = signature
        if (await this.verifyCertificateChain(chainData) && this.verifySignature(dataHash, chainData[0], signature)) {
          verified = true
          cname = this.getCommonNameFromCert(chainData[0])
        }
      } catch (err) {
        console.log(err)
      }
    }

    // return data
    let outputs: IOutput[] = paymentDetails.outputs.map((output) => {
      return {
        satoshis: output.amount,
        script: Buffer.from(output.script).toString('hex')
      }
    })
    let expires: number = paymentDetails.expires
    let memo: string = paymentDetails.memo
    let paymentUrl: string = paymentDetails.paymentUrl
    let merchantData: Uint8Array = paymentDetails.merchantData
    let merchantName: string = cname || 'unknown'

    return {
      outputs: outputs,
      expires: expires,
      memo: memo,
      paymentUrl: paymentUrl,
      merchantData: merchantData,
      merchantName: merchantName,
      r: url,
      verified: verified,
      bip70: true
    }
  }

  async sendPaymentToMerchant(url: string, tx: string, refundAddress: string, merchantData?: Uint8Array): Promise<string> {
    let root: protobuf.Root = await protobuf.load('assets/paymentrequest.proto')
    let Output: any = root.lookupType("payments.Output")
    let Payment: any = root.lookupType("payments.Payment")
    let output: any = Output.create({
      amount: 0,
      script: bitcoincash.Script.buildPublicKeyHashOut(new bitcoincash.Address(refundAddress)).toBuffer()
    })
    let payment: any = Payment.create({
      merchantData: merchantData,
      // transactions: [new Uint8Array(tx.match(/.{1,2}/g).map(x => parseInt(x, 16)))],
      transactions: [Buffer.from(tx, 'hex')],
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

  showUpdateAlert(): void {
    if (!this.platform.is('cordova')) {
      return
    }
    let updateAlert: any = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('PLEASE_UPDATE'),
      buttons: [{
        text: this.translate.instant('CANCEL')
      }, {
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

  // recovery dialog

  promptForRecovery(autoFill?: string, compliant?: boolean): Promise<void> {
    compliant = compliant === false ? false : true
    return new Promise<void>((resolve, reject) => {
      let recoverAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        cssClass: 'promptForRecoveryCSSClass',
        title: this.translate.instant(compliant ? 'RECOVER_WALLET' : 'RECOVER_NON_COMPLIANT_WALLET'),
        // message: this.translate.instant('RECOVERY_HINT'),
        inputs: [{
          name: 'name',
          placeholder: this.nextWalletName()
        }, {
          name: 'mnemonicOrXprvOrXpub',
          type: 'password',
          value: autoFill || '',
          placeholder: this.translate.instant(compliant ? 'RECOVERY_PHRASE_OR_XPRV' : 'RECOVERY_PHRASE')
        }, {
          name: 'path',
          type: 'password',
          placeholder: "m/44'/145'/0'"
        }, {
          name: 'passphrase',
          type: 'password',
          placeholder: this.translate.instant('RECOVERY_PASSPHRASE')
        }],
        buttons: [{
          role: 'cancel',
          text: this.translate.instant('CANCEL'),
          handler: data => {
            recoverAlert.dismiss().then(() => {
              resolve()
            })
            return false
          }
        }, {
          text: this.translate.instant('OK'),
          handler: data => {
            if (data.name && !this.r_nameIsValid(data.name) || data.path && !this.r_pathIsValid(data.path)) {
              return false
            }
            if (compliant) {
              if (data.mnemonicOrXprvOrXpub) {
                let validated: string = this.r_validatedMnemonicOrXprvOrXpub(data.mnemonicOrXprvOrXpub)
                if (!validated) {
                  return false
                }
                data.mnemonicOrXprvOrXpub = validated
              }
            } else {
              let validated: string = this.r_validatedMnemonicOnly(data.mnemonicOrXprvOrXpub)
              if (!validated) {
                return false
              }
              data.mnemonicOrXprvOrXpub = validated
            }
            recoverAlert.dismiss().then(() => {
              return this.r_recover(data.mnemonicOrXprvOrXpub, data.path, data.passphrase, data.name, compliant)
            }).catch((err) => {
              console.log(err)
            }).then(() => {
              resolve()
            })
            return false
          }
        }]
      })
      recoverAlert.present().then(() => {
        Array.from(window.document.querySelectorAll('.promptForRecoveryCSSClass input')).forEach((el: any) => {
          el.setAttribute('type', 'text')
          el.setAttribute('autocomplete', 'off')
          el.setAttribute('autocorrect', 'off')
        })
        window.setTimeout(() => {
          (window.document.querySelector('.promptForRecoveryCSSClass input') as any).blur()
        }, 0)
      })
    }).catch((err) => {
      console.log(err)
    })
  }

  r_nameIsValid(name: string): boolean {
    if (this.getAllWalletNames().indexOf(name) !== -1) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_INVALID_WALLET_NAME'),
        buttons: [this.translate.instant('OK')]
      }).present()
      return false
    } else {
      return true
    }
  }

  r_validatedMnemonicOnly(m: string): string {
    let errMessage: string
    m = this.formatMnemonic(m)
    if (!this.validateMnemonic(m)) {
      errMessage = this.translate.instant('ERR_INVALID_RECOVERY_PHRASE')
    }
    if (errMessage) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: [this.translate.instant('OK')]
      }).present()
    } else {
      return m
    }
  }

  r_validatedMnemonicOrXprvOrXpub(m: string): string {
    let errMessage: string
    m = m.trim()
    if (m.match(/^xpub.+$/gi)) {
      if (!this.validateXpub(m)) {
        errMessage = this.translate.instant('ERR_INVALID_XPUB')
      }
    } else if (m.match(/^xprv.+$/gi)) {
      if (!this.validateXprv(m)) {
        errMessage = this.translate.instant('ERR_INVALID_XPRV')
      }
    } else if (m.match(/^[0-1]+$/g)) {
      if (m.length < 128) {
        errMessage = this.translate.instant('ERR_NOT_ENOUGH_ENTROPY') + ' ' + m.length + '/128'
      } else {
        m = this.r_entropyToMnemonic(m, 2)
      }
    } else if (m.match(/^[1-6]+$/g)) {
      if (m.length < 50) {
        errMessage = this.translate.instant('ERR_NOT_ENOUGH_ENTROPY') + ' ' + m.length + '/50'
      } else {
        m = m.split('').map(s => s === '6' ? '0' : s).join('')
        m = this.r_entropyToMnemonic(m, 6)
      }
    // } else if (m.match(/^[0-9a-f]+$/gi)) {
    //   if (m.length < 32) {
    //     errMessage = this.translate.instant('ERR_NOT_ENOUGH_ENTROPY') + ' ' + m.length + '/32'
    //   } else {
    //     m = m.toLowerCase()
    //     m = this.r_entropyToMnemonic(m, 16)
    //   }
    } else {
      m = this.formatMnemonic(m)
      if (!this.validateMnemonic(m)) {
        errMessage = this.translate.instant('ERR_INVALID_RECOVERY_PHRASE')
      }
    }
    if (errMessage) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: [this.translate.instant('OK')]
      }).present()
    } else {
      return m
    }
  }

  r_entropyToMnemonic(entropy: string, base: number): string {
    let length: number = Math.floor(entropy.length * Math.log2(base))
    length = (length - length % 32) / 8
    let buf: Buffer = new BN(entropy, base).toArrayLike(Buffer, 'be', length + 4).slice(-length)
    return new bitcoincash_Mnemonic(buf).phrase
  }

  r_pathIsValid(path: string): boolean {
    path = path.trim().replace(/[‘’]/g, "'")
    if (!path.match(/^m(\/\d+'?)*$/g)) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_INVALID_DERIVATION_PATH'),
        buttons: [this.translate.instant('OK')]
      }).present()
      return false
    } else {
      return true
    }
  }

  async r_recover(mnemonicOrXprvOrXpub: string, path: string, passphrase: string, name: string, compliant: boolean): Promise<void> {
    path = path ? path.trim().replace(/[‘’]/g, "'") : undefined
    passphrase = passphrase || undefined
    name = name || undefined
    let translations: string[]
    if (mnemonicOrXprvOrXpub) {
      translations = ['RECOVERING', 'RECOVER_SUCCESS', 'RECOVER_FAILED']
    } else {
      translations = ['CREATING', 'CREATE_SUCCESS', 'CREATE_FAILED']
    }
    let error: Error
    let loader = this.loadingCtrl.create({
      content: this.translate.instant(translations[0]) + '...'
    })
    await loader.present()
    try {
      await this.recoverWalletFromMnemonicOrXprvOrXpub(mnemonicOrXprvOrXpub, path, passphrase, name, compliant)
    } catch (err) {
      console.log(err)
      error = err
    }
    await loader.dismiss()
    if (!error) {
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('SUCCESS'),
        message: this.translate.instant(translations[1]),
        buttons: [this.translate.instant('OK')]
      }).present()
    } else {
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant(translations[2]),
        buttons: [this.translate.instant('OK')]
      }).present()
    }
  }

  //web socket

  apiWS(method: string, params?: any, force?: boolean, timeout?: number): Promise<any> {
    let socket: any = this.socket
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
    return new Promise<any>((resolve, reject) => {
      let id: number = this.socketRequestId++
      let cb: Function
      let timer: number

      cb = (data: any) => {
        if (data.id !== id) {
          return
        }
        window.clearTimeout(timer)
        socket.off('response', cb)
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

      socket.on('response', cb)
      timer = window.setTimeout(() => {
        socket.off('response', cb)
        reject(new Error('timeout'))
      }, timeout)
      socket.emit('request', { id: id, method: method, params: params })
    })
  }

}
