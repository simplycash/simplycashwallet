import { Component, ViewChild } from '@angular/core'
import { AlertController, IonicPage, ModalController, NavController, NavParams, App, LoadingController, ToastController } from 'ionic-angular'
// import { Keyboard } from '@ionic-native/keyboard'
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-send',
  templateUrl: 'send.html'
})
export class SendPage {
  @ViewChild('address') addressEl
  @ViewChild('myAmount') myAmountEl
  private info: any
  private labelValue: string
  private messageValue: string
  private addressValue: string
  private merchantValue: string
  private memoValue: string
  private rValue: string

  constructor(
    public alertCtrl: AlertController,
    public navCtrl: NavController,
    private navParams: NavParams,
    public appCtrl: App,
    // private keyboard: Keyboard,
    public loadingCtrl: LoadingController,
    public modalCtrl: ModalController,
    private translate: TranslateService,
    private wallet: Wallet
  ) {
    // this.keyboard.onKeyboardHide().subscribe(() => {
    //   this.addressEl.setBlur()
    //   this.amountEl.setBlur()
    // })
    this.info = this.navParams.get('info')
    if (typeof this.info !== 'undefined') {
      this.labelValue = this.info.label
      this.messageValue = this.info.message
      this.addressValue = this.info.outputs[0].address
      this.merchantValue = this.info.merchantName
      this.memoValue = this.info.memo
      this.rValue = this.info.r
    }
  }

  ionViewDidEnter() {
    if (typeof this.info === 'undefined') {
      return
    }
    window.setTimeout(() => {
      this.myAmountEl.setFocus()
    }, 500)
  }

  async sign() {
    let output: any = {}
    let satoshis: number = this.myAmountEl.getSatoshis() //undefined means max amount
    let drain: boolean = typeof satoshis === 'undefined'

    try {
      // satoshis
      if (!drain) {
        if (isNaN(satoshis) || satoshis <= 0) {
          throw new Error('invalid amount')
        }
        if (satoshis > this.wallet.getCacheBalance()) {
          throw new Error('not enough fund')
        }
        output.satoshis = satoshis
      } else {
        output.satoshis = 0
      }

      // script
      if (typeof this.info !== 'undefined' && this.info.bip70) {
        output.script = this.info.outputs[0].script
      } else {
        let address: string = this.addressEl.value
        let af: string = this.wallet.getAddressFormat(address)
        if (typeof af === 'undefined') {
          throw new Error('invalid address')
        }
        let legacyAddr: string = this.wallet.convertAddress(af, 'legacy', address)
        output.script = this.wallet.scriptFromAddress(legacyAddr)
        output.address = address
      }
    } catch (err) {
      let errMessage = err.message
      if (err.message === 'not enough fund') {
        errMessage = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      } else if (err.message === 'invalid address') {
        errMessage = this.translate.instant('ERR_INVALID_ADDR')
      } else if (err.message === 'invalid amount') {
        errMessage = this.translate.instant('ERR_INVALID_AMOUNT')
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
      let signedTx: { satoshis: number, fee: number, hex: string } = await this.wallet.makeSignedTx([output], drain)
      await loader.dismiss()
      await this.navCtrl.push('ConfirmPage', {
        info: Object.assign(this.info || { outputs: [output] }, signedTx)
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

  resetForm() {
    this.addressEl.value = ''
    this.myAmountEl.clear()
  }

}
