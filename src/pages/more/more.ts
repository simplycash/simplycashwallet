import { Component } from '@angular/core';
import { AlertController, App, IonicPage, LoadingController, NavController, NavParams } from 'ionic-angular';
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'


@IonicPage()
@Component({
  selector: 'page-more',
  templateUrl: 'more.html',
})
export class MorePage {

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    private iab: InAppBrowser,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    private translate: TranslateService,
    private wallet: Wallet
  ) {

  }
  pushAddressesPage() {
    this.navCtrl.push('AddressesPage')
  }

  pushXpubPage() {
    this.navCtrl.push('XpubPage')
  }

  async showWRP() {
    await this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('BACKUP_WALLET'),
      message: `${this.translate.instant('RECOVERY_PHRASE')}:<br>${await this.wallet.getMnemonic()}<br><br>${this.translate.instant('DERIVATION_PATH')}:<br>m/44'/145'/0'`,
      buttons: ['ok']
    }).present()
  }

  async promptForMenmonic() {
    let recoverAlert = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('RECOVER_WALLET'),
      message: `${this.translate.instant('RECOVERY_HINT')}<br>(${this.translate.instant('DERIVATION_PATH')}: m/44'/145'/0')`,
      inputs: [{
        name: 'mnemonic',
        placeholder: this.translate.instant('RECOVERY_PHRASE')
      }],
      buttons: [{
        text: 'cancel',
        handler: data => {}
      },{
        text: 'recover',
        handler: data => {
          if (this.mnemonicIsValid(data.mnemonic)) {
            recoverAlert.dismiss().then(() => {
              this.recover(data.mnemonic)
            })
          }
          return false
        }
      }]
    })
    await recoverAlert.present()
  }

  mnemonicIsValid(m: string) {
    m = m.trim()
    if (!this.wallet.validateMnemonic(m)) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_INVALID_RECOVERY_PHRASE'),
        buttons: ['ok']
      }).present()
      return false
    } else {
      return true
    }
  }

  async recover(m: string) {
    m = m.trim()
    let error: Error
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('RECOVERING')+'...'
    })
    loader.present().then(() => {
      return this.wallet.recoverWalletFromMnemonic(m)
    }).then(() => {
      return this.app.getRootNav().setRoot('HomePage')
    }).catch((err: any) => {
      console.log(err)
      error = err
    }).then(() => {
      return loader.dismiss()
    }).then(() => {
      if (!error) {
        this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('SUCCESS'),
          message: this.translate.instant('RECOVER_SUCCESS'),
          buttons: ['ok']
        }).present()
      } else {
        this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('ERROR'),
          message: this.translate.instant('RECOVER_FAILED'),
          buttons: ['ok']
        }).present()
      }
    })
  }

  launchTwitter() {
    this.iab.create('https://twitter.com/simplycashapp', '_system')
  }

  launchTelegram() {
    this.iab.create('https://t.me/simplycashgroup', '_system')
  }

  pushSendPage() {
    this.navCtrl.push('SendPage', {
      info: { outputs: [{ address: 'qr4ewh5fdsfn2k4extwlmkmm9wp0034k95s4rzr6xa' }] }
    })
  }

}
