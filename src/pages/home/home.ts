import { ChangeDetectorRef, Component, NgZone } from '@angular/core'
import { AlertController, App, IonicPage, LoadingController, NavController, Platform, PopoverController, ToastController } from 'ionic-angular'
import { QRScanner, QRScannerStatus } from '@ionic-native/qr-scanner'
import { SocialSharing } from '@ionic-native/social-sharing'
import { Clipboard } from '@ionic-native/clipboard'
import * as webClipboard from 'clipboard-polyfill'
// import { Keyboard } from '@ionic-native/keyboard'
import { TranslateService } from '@ngx-translate/core'
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {
  public static readonly pageName = 'HomePage'
  public address: string
  public displayedAddress: string
  public amount: number
  public qrCodeURL: string
  public isSharing: boolean = false

  public updateCallback: Function
  public priceCallback: Function

  public cameraAccess: boolean = false
  public pauseSub: any
  public scanSub: any
  public scanState: string = 'stopped'
  public isTransparent: boolean = false

  public scanBeginTime: number
  public scanEndTime: number

  public qrCache: any = {}
  public qrCacheToast: any

  public hint: any
  public hintTimer: number
  public copyToast: any
  public copyToastTimer: number

  public firstTimeEnter: boolean = true
  public clipboardContent: string = ''
  public resumeSub: any
  public focusEventListener: any

  public timestamp: number

  public walletName: string

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    public ref: ChangeDetectorRef,
    public clipboard: Clipboard,
    // public keyboard: Keyboard,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public ngZone: NgZone,
    public platform: Platform,
    public popoverCtrl: PopoverController,
    public qrScanner: QRScanner,
    public socialSharing: SocialSharing,
    public toastCtrl: ToastController,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
    this.walletName = this.wallet.getCurrentWalletName()
    this.updateCallback = () => {
      this.refresh()
    }
    this.priceCallback = () => {
      this.timestamp = new Date().getTime()
    }
    if (this.platform.is('cordova')) {
      this.qrScanner.prepare().then((status: QRScannerStatus) => {
        if (status.authorized) {
          this.cameraAccess = true
        }
        return this.qrScanner.destroy()
      }).catch((err: any) => {

      })
    } else {
      this.clipboard = {
        copy: (text) => {
          return webClipboard.writeText(text)
        },
        paste: () => {
          return Promise.reject(new Error('unsupported'))
        }
      }
    }
  }

  ionViewWillEnter() {
    this.wallet.subscribeUpdate(this.updateCallback)
    this.wallet.subscribePrice(this.priceCallback)
    this.priceCallback()
    if (this.platform.is('cordova')) {
      this.resumeSub = this.platform.resume.subscribe(() => {
        this.handleClipboard()
      })
    } else {
      this.focusEventListener = () => {
        this.handleClipboard()
      }
      window.addEventListener('focus', this.focusEventListener)
    }
    this.handleClipboard()
  }

  ionViewDidEnter() {
    if (this.firstTimeEnter) {
      this.firstTimeEnter = false
      this.handleDeepLinks()
    }
  }

  ionViewDidLeave() {
    this.wallet.unsubscribeUpdate(this.updateCallback)
    this.wallet.unsubscribePrice(this.priceCallback)
    if (this.platform.is('cordova')) {
      this.resumeSub.unsubscribe()
    } else {
      window.removeEventListener('focus', this.focusEventListener)
    }
  }

  ionViewWillUnload() {

  }

  refresh() {
    this.address = this.wallet.getCacheReceiveAddress()
    if (this.walletName !== this.wallet.getCurrentWalletName()) {
      this.walletName = this.wallet.getCurrentWalletName()
      this.handleClipboard()
    }
    // return this.updateQR()
  }

  addressChange(ev: any) {
    this.displayedAddress = ev.value
    return this.updateQR()
  }

  amountChange(sat: number) {
    this.amount = sat
    return this.updateQR()
  }

  updateQR() {
    let text = this.wallet.getPaymentRequestURL(this.displayedAddress, this.amount)
    return this.wallet.getQR(text).then((url) => {
      this.qrCodeURL = url
    }).catch((err: any) => {
      console.log(err)
    })
  }

  async share() {
    if (this.isSharing || !this.platform.is('cordova')) {
      return
    }
    let message: string = `${this.translate.instant('MY_BITCOIN_CASH_ADDRESS')}:\n${this.displayedAddress}\n\n`
    let link: string = 'https://simply.cash/send'
    if (this.amount > 0) {
      let amount: string = this.wallet.convertUnit('SATS', 'BSV', this.amount.toString()).replace(/\.?0+$/,'')
      message += `${this.translate.instant('REQUEST_AMOUNT')}:\n${amount} BSV\n\n`
      link += '-' + amount
    }
    link += `-BSV-to-${this.displayedAddress}`
    message += `${this.translate.instant('SIMPLY_LAUNCH')}:\n${link}`
    this.isSharing = true
    try {
      await this.socialSharing.share(message)
    } catch (err) {
      console.log(err)
    }
    this.isSharing = false
  }

  reconnect(ev: any) {
    this.wallet.showAnnouncement()
    this.wallet.tryToConnectAndSync()
  }

  async startScan() {
    try {
      if (this.scanState !== 'stopped') {
        return
      }
      if (typeof this.hint !== 'undefined') {
        this.hint.dismiss()
      }
      this.scanState = 'starting'
      this.scanBeginTime = new Date().getTime()
      let status: QRScannerStatus = await this.qrScanner.prepare()
      if (!status.authorized) {
        throw new Error('permission denied')
      }
      if (!this.cameraAccess) {
        this.cameraAccess = true
        await this.destroyScanner()
        return
      }
      if (this.scanState === 'stopping') {
        await this.destroyScanner()
        return
      }
      this.scanState = 'scanning'
      this.pauseSub = this.platform.pause.subscribe(() => {
        this.ngZone.run(async () => {
          await this.stopScan()
        })
      })
      this.scanSub = this.qrScanner.scan().subscribe((text: string) => {
        this.scanState = 'processing'
        this.ngZone.run(async () => {
          await this.stopScan(true)
          await this.handleQRText(text)
          this.isTransparent = false
          this.ref.detectChanges()
          await this.destroyScanner()
        })
      })
      this.isTransparent = true
      this.qrScanner.show()
    } catch (err) {
      console.log(err)
      this.scanState = 'stopped'
      if (err.message === 'permission denied' || err.name === 'CAMERA_ACCESS_DENIED') {
        await this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('ERROR'),
          message: this.translate.instant('ERR_CAMERA_PERMISSION_DENIED'),
          buttons: [this.translate.instant('OK')]
        }).present()
      }
    }
  }

  async stopScan(keepPreview?: boolean) {
    if (this.scanState === 'stopped'
    || this.scanState === 'stopping'
    || this.scanState === 'willDestroy'
    || this.scanState === 'destroying'
    || this.scanState === 'processing') {
      return
    }
    this.scanEndTime = new Date().getTime()
    if (this.scanEndTime - this.scanBeginTime < 500) {
      if (typeof this.hint === 'undefined') {
        this.hint = this.toastCtrl.create({
          message: this.translate.instant('CAMERA_BUTTON_HINT'),
          position: 'bottom',
          dismissOnPageChange: true
        })
        this.hint.onWillDismiss(() => {
          window.clearTimeout(this.hintTimer)
          this.hint = undefined
        })
        this.hint.present()
      } else {
        window.clearTimeout(this.hintTimer)
      }
      this.hintTimer = window.setTimeout(() => {
        this.hint.dismiss()
      }, 3000)
    }
    if (this.scanState === 'starting') {
      this.scanState = 'stopping'
      return
    }
    this.pauseSub.unsubscribe()
    this.scanSub.unsubscribe() // stop scanning
    if (!keepPreview) {
      this.isTransparent = false
      this.scanState = 'willDestroy'
      window.setTimeout(() => {
        this.destroyScanner()
      }, 200)
    }
    // this.qrScanner.hide()
  }

  async destroyScanner() {
    this.scanState = 'destroying'
    await this.qrScanner.destroy()
    this.scanState = 'stopped'
  }

  showMenu(myEvent: any) {
    this.popoverCtrl.create('SettingsPage').present({
      ev: myEvent
    })
  }

  copyAddress() {
    let a: string = this.displayedAddress
    this.clipboard.copy(a).then(() => {
      if (this.copyToast) {
        window.clearTimeout(this.copyToastTimer)
      } else {
        this.copyToast = this.toastCtrl.create({
          message: this.translate.instant('ADDRESS_COPIED'),
          position: 'bottom',
          dismissOnPageChange: true
        })
        this.copyToast.onWillDismiss(() => {
          window.clearTimeout(this.copyToastTimer)
          this.copyToast = undefined
        })
        this.copyToast.present()
      }
      this.copyToastTimer = window.setTimeout(() => {
        this.copyToast.dismiss()
      }, 1000)
      // shortcut
      this.clipboardContent = ''
      // return this.handleClipboard()
    }).catch((err: any) => {
      console.log(err)
    })
  }

  async handleQRText(text: string) {
    if (await this.handleURL(text)) { // bitcoincash:... is handled here
      return true
    }
    if (this.wallet.getAddressFormat(text) && await this.handleURL('bitcoin:' + text + '?sv')) { // possibly bitcoin:cashaddr?sv
      return true
    }
    if (this.wallet.validateWIF(text)) {
      await this.navCtrl.push('SweepPage', {
        wif: text
      })
      return true
    }
    if (this.wallet.validateEncryptedWIF(text)) {
      await this.navCtrl.push('SweepPage', {
        encrypted: true,
        wif: text
      })
      return true
    }
    if (this.wallet.validateMnemonic(text) || this.wallet.validateXprv(text) || this.wallet.validateXpub(text)) {
      this.wallet.promptForRecovery(text) // no await
      return true
    }
    if (this.handleUnsignedTx(text)) {
      return true
    }
    if (this.handleSignedTx(text)) {
      return true
    }
    await this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('ERR_INVALID_DATA'),
      message: text,
      buttons: [this.translate.instant('OK')]
    }).present()
    return false
  }

  async handleURL(url: string) {
    let info: any = this.wallet.getRequestFromURL(url)
    if (typeof info === 'undefined') {
      return false
    }
    if (typeof info.url !== 'undefined') {
      info = await this.handleBIP70(info.url)
      if (typeof info === 'undefined') {
        return false
      }
    }
    if (info.outputs.length === 0) {
      return false
    }
    await this.navCtrl.push('SendPage', {
      info: info
    })
    return true
  }

  async handleBIP70(url: string) {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('LOADING')+'...'
    })
    await loader.present()
    let request: any
    let errMessage: string
    try {
      request = await this.wallet.getRequestFromMerchant(url)
    } catch (err) {
      console.log(err)
      if (err.message === 'unsupported network') {
        errMessage = this.translate.instant('ERR_UNSUPPORTED_NETWORK')
      } else if (err.message === 'expired') {
        errMessage = this.translate.instant('ERR_EXPIRED')
      } else {
        errMessage = this.translate.instant('ERR_GET_REQUEST_FAIlED')
      }
    }
    await loader.dismiss()
    if (typeof errMessage === 'undefined') {
      return request
    } else {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: [this.translate.instant('OK')]
      }).present()
    }
  }

  handleUnsignedTx(text: string): boolean {
    return this.handleSplitQR(text, 'unsigned', (data) => {
      try {
        let unsignedTx: any = JSON.parse(data)
        this.wallet.validatePreparedTx(unsignedTx)
        this.navCtrl.push('SignPage', {
          unsignedTx: unsignedTx
        })
      } catch (err) {
        this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('ERROR'),
          message: this.translate.instant('ERR_UNABLE_TO_SIGN'),
          buttons: [this.translate.instant('OK')]
        }).present()
      }
    })
  }

  handleSignedTx(text: string): boolean {
    return this.handleSplitQR(text, 'signed', (hex) => {
      this.wallet.broadcastTx(hex)
    })
  }

  handleSplitQR(text: string, prefix: string, success: Function): boolean {
    let regex: RegExp = new RegExp('^' + prefix + ' \\d+ \\d+ ', 'gi')
    let matches: string[] = text.match(regex)
    if (!matches || this.qrCache.prefix && this.qrCache.prefix !== prefix) {
      return false
    }
    let m: string[] = matches[0].split(' ')
    let current: number = parseInt(m[1])
    let final: number = parseInt(m[2])
    if (current === 0) {
      this.qrCache.prefix = prefix
      this.qrCache.data = []
    } else if (!this.qrCache.prefix || current !== this.qrCache.data.length) {
      return false
    }
    this.qrCache.data.push(text.slice(matches[0].length))
    if (current === final) {
      let data: string = this.qrCache.data.join('')
      if (this.qrCacheToast) {
        this.qrCacheToast.dismiss()
      } else {
        delete this.qrCache.prefix
        delete this.qrCache.data
      }
      success(data)
    } else {
      let toast: any = this.toastCtrl.create({
        message: [current + 1, final + 1].join('/'),
        position: 'bottom',
        showCloseButton: true,
        closeButtonText: this.translate.instant('CANCEL'),
        dismissOnPageChange: true
      })
      toast.onWillDismiss(() => {
        if (toast !== this.qrCacheToast) {
          return
        }
        delete this.qrCache.prefix
        delete this.qrCache.data
        this.qrCacheToast = undefined
      })
      toast.present()
      let oldToast: any = this.qrCacheToast
      this.qrCacheToast = toast
      if (oldToast) {
        oldToast.dismiss()
      }
    }
    return true
  }

  handleDeepLinks() {

    // Check if app was resume by custom url scheme
    (window as any).handleOpenURL = (url: string) => {
      if (this.platform.is('ios') && !url.match(/^bitcoin([-_]?(sv|cash))?:.*$/gi)) {
        return
      }
      if (
        this.app._appRoot._overlayPortal.getActive() ||
        this.app._appRoot._loadingPortal.getActive() ||
        this.app._appRoot._modalPortal.getActive() ||
        this.app._appRoot._toastPortal.getActive()
      ) {
        return
      }
      window.setTimeout(() => {
        this.ngZone.run(async () => {
          if (await this.handleURL(url)) {
            return
          }
          await this.alertCtrl.create({
            enableBackdropDismiss: false,
            title: this.translate.instant('ERR_INVALID_DATA'),
            message: url,
            buttons: [this.translate.instant('OK')]
          }).present()
        })
      }, 0)
      return true
    }

    // Check if app was opened by custom url scheme
    const lastUrl: string = (window as any).handleOpenURL_LastURL || ''
    if (lastUrl !== '') {
      delete (window as any).handleOpenURL_LastURL;
      (window as any).handleOpenURL(lastUrl)
    }
  }

  handleClipboard() {
    this.clipboard.paste().then((content: string) => {
      this.clipboardContent = ''
      if (!content) {
        return
      }
      let af: string = this.wallet.getAddressFormat(content)
      if (this.wallet.getRequestFromURL(content) || af && !this.wallet.isMyReceiveAddress(this.wallet.convertAddress(af, 'legacy', content))) {
        this.clipboardContent = content
      }
    }).catch((err: any) => {

    })
  }

  quickSend() {
    this.handleQRText(this.clipboardContent)
  }

  clearClipboard() {
    this.clipboard.copy('').then(() => {
      this.clipboardContent = ''
    }).catch((err: any) => {

    })
  }

}
