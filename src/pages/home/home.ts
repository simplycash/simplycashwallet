import { ChangeDetectorRef, Component, NgZone, ViewChild } from '@angular/core'
import { AlertController, App, IonicPage, LoadingController, NavController, NavParams, Platform, PopoverController, ToastController } from 'ionic-angular'
import { QRScanner, QRScannerStatus } from '@ionic-native/qr-scanner'
import { SocialSharing } from '@ionic-native/social-sharing'
import { StatusBar } from '@ionic-native/status-bar'
import { Clipboard } from '@ionic-native/clipboard'
// import { Keyboard } from '@ionic-native/keyboard'
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {

  private address: string
  private displayedAddress: string
  private amount: number
  private qrCodeURL: string

  private updateCallback: Function

  private pauseSub: any
  private scanSub: any
  private scanState: string = 'stopped'
  private isTransparent: boolean = false

  private scanBeginTime: number
  private scanEndTime: number
  private destroyTimer: number

  private hint: any
  private hintTimer: number

  constructor(
    public alertCtrl: AlertController,
    private app: App,
    private ref: ChangeDetectorRef,
    private clipboard: Clipboard,
    // private keyboard: Keyboard,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    private ngZone: NgZone,
    private platform: Platform,
    public popoverCtrl: PopoverController,
    private qrScanner: QRScanner,
    private socialSharing: SocialSharing,
    private statusBar: StatusBar,
    private toastCtrl: ToastController,
    private translate: TranslateService,
    private wallet: Wallet
  ) {
    this.updateCallback = () => {
      this.refresh()
    }
  }

  ionViewDidEnter() {
    this.wallet.subscribeUpdate(this.updateCallback)
    this.handleDeepLinks()
  }

  ionViewDidLeave() {
    this.wallet.unsubscribeUpdate(this.updateCallback)
  }

  ionViewWillUnload() {

  }

  refresh() {
    this.address = this.wallet.getCacheReceiveAddress()
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

  share() {
    let message: string = ''
    let link: string = 'https://simply.cash/send'
    if (this.amount > 0) {
      let amount: string = this.wallet.convertUnit('SATOSHIS', 'BCH', this.amount.toString()).replace(/\.?0+$/,'')
      message += `please send ${amount} BCH to `
      link += '-' + amount
    }
    message += `my bitcoin cash address:\n${this.displayedAddress}\n\n`
    link += `-BCH-to-${this.displayedAddress}`
    message += `simply launch your wallet: \n${link}`
    this.socialSharing.share(message).catch((err: any) => {
      console.log(err)
    })
  }

  reconnect(ev: any) {
    this.wallet.tryToConnectAndSync()
  }

  startScan() {
    window.clearTimeout(this.destroyTimer)
    this.scanState = 'starting'
    this.scanBeginTime = new Date().getTime()
    this.qrScanner.getStatus().then((status: QRScannerStatus) => {
      if (status.prepared) {
        return status
      } else {
        return this.qrScanner.prepare()
      }
    }).then((status: QRScannerStatus) => {
      if (status.authorized) {
        if (this.scanState === 'stopping' || new Date().getTime() - this.scanBeginTime > 500) {
          this.scanState = 'stopped'
          this.qrScanner.destroy()
          return
        }
        this.scanState = 'scanning'
        this.pauseSub = this.platform.pause.subscribe(() => {
          this.ngZone.run(() => {
            this.stopScan()
          })
        })
        this.scanSub = this.qrScanner.scan().subscribe((text: string) => {
          this.ngZone.run(async () => {
            this.stopScan(true)
            await this.handleQRText(text)
            this.isTransparent = false
            this.ref.detectChanges()
            this.destroyTimer = window.setTimeout(() => {
              this.qrScanner.destroy()
            }, 500)
          })
        })
        this.isTransparent = true
        // this.statusBar.hide()
        this.qrScanner.show()
      } else if (status.denied) {
        this.scanState = 'stopped'
        this.qrScanner.openSettings()
        // camera permission was permanently denied
        // you must use QRScanner.openSettings() method to guide the user to the settings page
        // then they can grant the permission from there
      } else {
        this.scanState = 'stopped'
        // permission was denied, but not permanently. You can ask for permission again at a later time.
      }
    }).catch((e: any) => {
      console.log(e)
      this.scanState = 'stopped'
    })
  }

  stopScan(keepPreview?: boolean) {
    if (this.scanState === 'stopped') {
      return
    }
    if (this.scanState === 'starting') {
      this.scanState = 'stopping'
      return
    }
    this.scanState = 'stopped'
    if (!keepPreview) {
      this.isTransparent = false
      this.destroyTimer = window.setTimeout(() => {
        this.qrScanner.destroy()
      }, 500)
    }
    // this.statusBar.show()
    // this.qrScanner.hide()
    this.pauseSub.unsubscribe()
    this.scanSub.unsubscribe() // stop scanning
    this.scanEndTime = new Date().getTime()
    if (this.scanEndTime - this.scanBeginTime < 500) {
      if (typeof this.hint === 'undefined') {
        this.hint = this.toastCtrl.create({
          message: this.translate.instant('CAMERA_BUTTON_HINT'),
          position: 'middle'
        })
        this.hint.onWillDismiss(() => {
          this.hint = undefined
        })
        this.hint.present()
      } else {
        window.clearTimeout(this.hintTimer)
      }
      this.hintTimer = window.setTimeout(() => {
        this.hint.dismiss()
      }, 2000)
    }
  }

  showMenu(myEvent: any) {
    this.popoverCtrl.create('SettingsPage').present({
      ev: myEvent
    })
  }

  copyAddress() {
    this.clipboard.copy(this.displayedAddress)
  }

  async handleQRText(text: string) {
    if (await this.handleURL(text)) {
      return true
    }
    if (this.wallet.validateWIF(text)) {
      await this.navCtrl.push('SweepPage', {
        wif: text
      })
      return true
    }
    await this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('ERR_INVALID_DATA'),
      message: text,
      buttons: ['ok']
    }).present()
    return false
  }

  async handleURL(url: string) {
    let info: any = this.wallet.getRequestFromURL(url)
    if (typeof info === 'undefined') {
      return false
    }
    if (typeof info.url !== 'undefined') {
      await this.handleBIP70(info)
      return true
    } else {
      return await this.handleRequest(info)
    }
  }

  async handleRequest(info: any) {
    if (info.outputs.length === 0) {
      return false
    }
    if (info.outputs.map(output => output.satoshis).reduce((acc, curr) => acc + curr) > 0) {
      await this.sign(info)
    } else {
      info.outputs = info.outputs.slice(0, 1)
      await this.navCtrl.push('SendPage', {
        info: info
      })
    }
    return true
  }

  async handleBIP70(info: any) {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('LOADING')+"..."
    })
    await loader.present()
    let request: any
    let errMessage: string
    try {
      request = await this.wallet.getRequestFromMerchant(info.url)
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
      return await this.handleRequest(request)
    } else {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: ['ok']
      }).present()
      // fallback
      // this.handleRequest(info)
    }
  }

  handleDeepLinks() {

    // Check if app was resume by custom url scheme
    (window as any).handleOpenURL = (url: string) => {
      if (this.platform.is('ios') && url.indexOf('bitcoincash:') !== 0) {
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
            buttons: ['ok']
          }).present()
        })
      }, 0)
    }

    // Check if app was opened by custom url scheme
    const lastUrl: string = (window as any).handleOpenURL_LastURL || ""
    if (lastUrl !== "") {
      delete (window as any).handleOpenURL_LastURL;
      (window as any).handleOpenURL(lastUrl)
    }
  }

  async sign(info: any) {
    try {
      let satoshis: number = info.outputs.map(output => output.satoshis).reduce((acc, curr) => acc + curr)
      if (satoshis > this.wallet.getCacheBalance()) {
        throw new Error('not enough fund')
      }
      info.outputs = info.outputs.filter(output => output.satoshis > 0)
      info.outputs.forEach((output) => {
        if (typeof output.address !== 'undefined') {
          let af: string = this.wallet.getAddressFormat(output.address)
          if (typeof af === 'undefined') {
            throw new Error('invalid address')
          }
          let legacyAddr: string = this.wallet.convertAddress(af, 'legacy', output.address)
          output.script = this.wallet.scriptFromAddress(legacyAddr)
        } else if (typeof output.script === 'undefined') {
          throw new Error('invalid output')
        }
      })
    } catch (err) {
      console.log(err)
      let errMessage = err.message
      if (err.message === 'not enough fund') {
        errMessage = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      } else if (err.message === 'invalid address') {
        errMessage = this.translate.instant('ERR_INVALID_ADDR')
      } else if (err.message === 'invalid output') {
        errMessage = this.translate.instant('ERR_INVALID_OUTPUT')
      }
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: ['ok']
      }).present()
      return
    }

    let loader = this.loadingCtrl.create({
      content: this.translate.instant('SIGNING')+"..."
    })
    await loader.present()

    try {
      let signedTx: { satoshis: number, hex: string, fee: number } = await this.wallet.makeSignedTx(info.outputs)
      await loader.dismiss()
      await this.navCtrl.push('ConfirmPage', {
        info: Object.assign(info, signedTx)
      })
    } catch (err) {
      console.log(err)
      await loader.dismiss()
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: err.message,
        buttons: ['ok']
      }).present()
    }
  }


}
