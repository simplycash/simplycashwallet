import { Component, NgZone, ViewChild } from '@angular/core'
import { AlertController, App, IonicPage, LoadingController, NavController, NavParams, Platform, PopoverController, ToastController } from 'ionic-angular'
import { QRScanner, QRScannerStatus } from '@ionic-native/qr-scanner'
import { SocialSharing } from '@ionic-native/social-sharing'
import { StatusBar } from '@ionic-native/status-bar'
import { Clipboard } from '@ionic-native/clipboard'
// import { Keyboard } from '@ionic-native/keyboard'

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
  private canStart: boolean = true
  private canStop: boolean = false
  private isTransparent: boolean = false

  private scanBeginTime: number
  private scanEndTime: number
  private destroyTimer: number

  constructor(
    public alertCtrl: AlertController,
    private app: App,
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
    private wallet: Wallet
  ) {
    this.updateCallback = () => {
      this.refresh()
    }
  }

  ionViewDidEnter() {
    // this.handleURL('bitcoincash:?r=https://bitpay.com/i/3BV1vfZ3PsF3xG3sTAPUFh')
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
    if (this.amount > 0) {
      let amount: string = this.wallet.convertUnit('SATOSHIS', 'BCH', this.amount.toString()).replace(/\.?0+$/,'')
      message = `please send ${amount} BCH to `
    }
    message += `my bitcoin cash address:\n${this.displayedAddress}\n\n`
    message += 'simply launch your wallet: \nhttps://simply.cash/r/'
    message += this.wallet.getPaymentRequestURL(this.displayedAddress, this.amount).slice(12)
    this.socialSharing.share(message).catch((err: any) => {
      console.log(err)
    })
  }

  reconnect(ev: any) {
    this.wallet.tryToConnectAndSync()
  }

  startScan() {
    clearTimeout(this.destroyTimer)
    this.canStart = true
    this.canStop = false
    this.scanBeginTime = new Date().getTime()
    this.qrScanner.getStatus().then((status: QRScannerStatus) => {
      if (status.prepared) {
        return status
      } else {
        return this.qrScanner.prepare()
      }
    }).then((status: QRScannerStatus) => {
      if (status.authorized) {
        if (!this.canStart || new Date().getTime() - this.scanBeginTime > 500) {
          this.qrScanner.destroy()
          return
        }
        this.canStop = true
        this.pauseSub = this.platform.pause.subscribe(() => {
          this.ngZone.run(() => {
            this.stopScan()
          })
        })
        this.scanSub = this.qrScanner.scan().subscribe((text: string) => {
          this.ngZone.run(async () => {
            if (this.handleQRText(text)) {
              this.stopScan()
            }
          })
        })
        this.isTransparent = true
        // this.statusBar.hide()
        this.qrScanner.show()
      } else if (status.denied) {
        this.qrScanner.openSettings()
        // camera permission was permanently denied
        // you must use QRScanner.openSettings() method to guide the user to the settings page
        // then they can grant the permission from there
      } else {
        // permission was denied, but not permanently. You can ask for permission again at a later time.
      }
    }).catch((e: any) => {
      console.log(e)
    })
  }

  stopScan() {
    if (!this.canStop) {
      this.canStart = false
      return
    }
    this.isTransparent = false
    // this.statusBar.show()
    // this.qrScanner.hide()
    this.destroyTimer = setTimeout(() => {
      this.qrScanner.destroy()
    }, 200)
    this.pauseSub.unsubscribe()
    this.scanSub.unsubscribe() // stop scanning
    this.scanEndTime = new Date().getTime()
    if (this.scanEndTime - this.scanBeginTime < 500) {
      this.toastCtrl.create({
        message: 'hold to scan QR code',
        duration: 3000,
        position: 'middle'
      }).present()
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

  handleQRText(text: string) {
    if (this.handleURL(text)) {
      return true
    }
    if (this.wallet.validateWIF(text)) {
      this.navCtrl.push('SweepPage', {
        wif: text
      })
      return true
    }
    return false
  }

  handleURL(url: string) {
    let info: any = this.wallet.getRequestFromURL(url)
    if (typeof info === 'undefined') {
      return false
    }
    if (typeof info.url !== 'undefined') {
      this.handleBIP70(info)
      return true
    }
    return this.handleRequest(info)
  }

  handleRequest(info: any) {
    if (info.outputs.length === 0) {
      return false
    }
    if (info.outputs.map(output => output.satoshis).reduce((acc, curr) => acc + curr) > 0) {
      this.sign(info)
    } else {
      info.outputs = info.outputs.slice(0, 1)
      this.navCtrl.push('SendPage', {
        info: info
      })
    }
    return true
  }

  async handleBIP70(info: any) {
    let loader = this.loadingCtrl.create({
      content: "loading..."
    })
    await loader.present()
    let request: any
    let errMessage: string
    try {
      request = await this.wallet.getRequestFromMerchant(info.url)
    } catch (err) {
      console.log(err)
      if (err.message === 'unsupported network' || err.message === 'expired') {
        errMessage = err.message
      } else {
        errMessage = 'failed to get payment request'
      }
    }
    await loader.dismiss()
    if (typeof errMessage === 'undefined') {
      this.handleRequest(request)
    } else {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Error',
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
      if (
        this.app._appRoot._overlayPortal.getActive() ||
        this.app._appRoot._loadingPortal.getActive() ||
        this.app._appRoot._modalPortal.getActive() ||
        this.app._appRoot._toastPortal.getActive()
      ) {
        return
      }
      setTimeout(() => {
        this.ngZone.run(async () => {
          if (this.handleURL(url)) {
            return
          }
          this.alertCtrl.create({
            enableBackdropDismiss: false,
            title: 'Invalid Data',
            message: url,
            buttons: ['ok']
          }).present()
        })
      }, 0)
    }

    // Check if app was opened by custom url scheme
    const lastUrl: string = (window as any).handleOpenURL_LastURL || "";
    if (lastUrl && lastUrl !== "") {
      delete (window as any).handleOpenURL_LastURL;
      setTimeout(() => {
        this.ngZone.run(() => {
          this.handleURL(lastUrl)
        })
      }, 0)
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
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Error',
        message: err.message,
        buttons: ['ok']
      }).present()
      return
    }

    try {
      let signedTx: { satoshis: number, hex: string, fee: number } = await this.wallet.makeSignedTx(info.outputs)
      this.navCtrl.push('ConfirmPage', {
        info: Object.assign(info, signedTx)
      })
    } catch (err) {
      console.log(err)
      if (err.message === 'cancelled') {
        return
      }
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Error',
        message: err.message,
        buttons: ['ok']
      }).present()
    }
  }


}
