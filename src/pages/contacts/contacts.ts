import { Component } from '@angular/core'
import { AlertController, IonicPage, NavController, NavParams, ViewController } from 'ionic-angular'
import { TranslateService } from '@ngx-translate/core'
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-contacts',
  templateUrl: 'contacts.html',
})
export class ContactsPage {
  public contacts: string[]

  constructor(
    public alertCtrl: AlertController,
    public navCtrl: NavController,
    public navParams: NavParams,
    public viewCtrl: ViewController,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
    this.contacts = this.wallet.getContacts()
  }

  selectContact(contact: string) {
    let cb = this.navParams.get('cb')
    cb(contact)
    this.viewCtrl.dismiss()
  }

  async deleteContact(contact: string) {
    let confirm = await new Promise((resolve, reject) => {
      let ans: boolean = false
      let deleteContactAlert = this.alertCtrl.create({
        enableBackdropDismiss: true,
        title: this.translate.instant('DELETE'),
        message: contact,
        buttons: [{
          role: 'cancel',
          text: this.translate.instant('CANCEL')
        },
        {
          text: this.translate.instant('OK'),
          handler: () => {
            ans = true
          }
        }]
      })
      deleteContactAlert.onDidDismiss(() => {
        resolve(ans)
      })
      deleteContactAlert.present()
    })
    if (!confirm) {
      return
    }
    await this.wallet.removeContact(contact)
    this.contacts = this.wallet.getContacts()
  }

}
